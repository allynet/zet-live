use std::collections::{BTreeMap, HashMap};

use tracing::debug;

use super::TripStopTime;

#[derive(Debug, Clone)]
pub struct ScheduledStop {
    pub stop_id: String,
    pub stop_sequence: i64,
    pub stop_name: String,
    pub arrival_time_seconds: Option<i64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct LiveStopTime {
    pub stop_sequence: i64,
    pub arrival_time: Option<i64>,
    pub arrival_delay: Option<i64>,
}

#[derive(Debug, Clone, Copy)]
pub struct LiveVehicleAnchor {
    pub next_stop_sequence: i64,
    pub next_stop_arrival_time: Option<i64>,
}

/// Pick the feed-wide base midnight from live stop-time updates.
pub fn compute_base_midnight(
    stop_times: impl Iterator<Item = (Option<i64>, Option<i64>, Option<i64>)>,
) -> i64 {
    let now = jiff::Timestamp::now().as_second();

    stop_times
        .filter_map(|(arrival_time, arrival_delay, arrival_time_seconds)| {
            Some((
                arrival_time?,
                arrival_delay.unwrap_or(0),
                arrival_time_seconds?,
            ))
        })
        .map(|(live_time, delay, offset)| {
            let base = live_time - delay - offset;

            (base, base.abs_diff(now))
        })
        .reduce(|(best_base, best_diff), (base, diff)| {
            if diff < best_diff && diff < 86400 * 2 {
                (base, diff)
            } else {
                (best_base, best_diff)
            }
        })
        .map_or(0, |(base, _)| base)
}

/// Infer a trip's service-day midnight from one live observation.
#[inline]
pub fn try_infer_base_midnight(live_time: i64, delay: i64, offset: i64, now: i64) -> Option<i64> {
    let computed = live_time - delay - offset;
    (computed.abs_diff(now) < 86400 * 2).then_some(computed)
}

pub fn predict_trip_stop_times(
    scheduled: Vec<ScheduledStop>,
    live: &[LiveStopTime],
    vehicle: Option<LiveVehicleAnchor>,
    global_base_midnight: i64,
    trip_id: &str,
) -> Vec<TripStopTime> {
    let schedule_offsets: BTreeMap<i64, i64> = scheduled
        .iter()
        .filter_map(|s| Some((s.stop_sequence, s.arrival_time_seconds?)))
        .collect();

    let now = jiff::Timestamp::now().as_second();
    let base_midnight = live
        .iter()
        .find_map(|l| {
            let time = l.arrival_time?;
            let offset = scheduled
                .iter()
                .find(|s| s.stop_sequence == l.stop_sequence)
                .and_then(|s| s.arrival_time_seconds)?;
            let delay = l.arrival_delay.unwrap_or(0);
            try_infer_base_midnight(time, delay, offset, now)
        })
        .unwrap_or(global_base_midnight);

    let live_by_seq = live
        .iter()
        .map(|l| (l.stop_sequence, l))
        .collect::<HashMap<_, _>>();

    let mut delay_map = BTreeMap::new();
    for l in live {
        if let Some(delay) = l.arrival_delay {
            delay_map.insert(l.stop_sequence, delay);
        } else if let (Some(time), Some(offset)) = (
            l.arrival_time,
            scheduled
                .iter()
                .find(|s| s.stop_sequence == l.stop_sequence)
                .and_then(|s| s.arrival_time_seconds),
        ) {
            let sched_unix = base_midnight + offset;
            let computed_delay = time - sched_unix;
            delay_map.insert(l.stop_sequence, computed_delay);
        }
    }

    let mut stop_times = scheduled
        .into_iter()
        .map(|s| {
            let live_stu = live_by_seq.get(&s.stop_sequence);

            let has_live_prediction =
                live_stu.is_some_and(|l| l.arrival_time.is_some() || l.arrival_delay.is_some());

            let propagated_delay = delay_map
                .range(..=s.stop_sequence)
                .next_back()
                .map(|(_, &d)| d);

            let predicted_arrival = if has_live_prediction && let Some(live_stu) = live_stu {
                if live_stu.arrival_time.is_some() {
                    live_stu.arrival_time
                } else if let (Some(delay), Some(offset)) =
                    (live_stu.arrival_delay, s.arrival_time_seconds)
                {
                    Some(base_midnight + offset + delay)
                } else {
                    None
                }
            } else if let (Some(offset), Some(delay)) = (s.arrival_time_seconds, propagated_delay) {
                Some(base_midnight + offset + delay)
            } else {
                None
            };

            TripStopTime {
                stop_id: s.stop_id,
                stop_sequence: s.stop_sequence,
                stop_name: s.stop_name,
                arrival_time: predicted_arrival,
            }
        })
        .collect::<Vec<_>>();

    clamp_non_monotonic(&mut stop_times, trip_id);

    if let Some(vehicle) = vehicle {
        apply_vehicle_anchor(&mut stop_times, &schedule_offsets, vehicle, now);
    }

    stop_times
}

fn clamp_non_monotonic(stop_times: &mut [TripStopTime], trip_id: &str) {
    let mut max_time = None;

    for st in stop_times {
        let Some(t) = st.arrival_time else {
            continue;
        };

        if let Some(max) = max_time
            && t < max
        {
            debug!(
                stop_id = %st.stop_id,
                stop_sequence = st.stop_sequence,
                predicted = t,
                previous_max = max,
                ?trip_id,
                "Non-monotonic arrival time detected, clamping to previous"
            );
            st.arrival_time = Some(max);
        }

        max_time = Some(t.max(max_time.unwrap_or(i64::MIN)));
    }
}

fn apply_vehicle_anchor(
    stop_times: &mut [TripStopTime],
    schedule_offsets: &BTreeMap<i64, i64>,
    vehicle: LiveVehicleAnchor,
    now: i64,
) {
    let next_seq = vehicle.next_stop_sequence;
    let anchor_offset = schedule_offsets.get(&next_seq).copied();
    let fill_anchor = vehicle.next_stop_arrival_time.map_or(now, |t| t.max(now));

    clear_passed_stops(stop_times, next_seq, now);

    if let Some(anchor_offset) = anchor_offset {
        interpolate_backward(stop_times, schedule_offsets, next_seq, now);
        propagate_forward(
            stop_times,
            schedule_offsets,
            fill_anchor,
            anchor_offset,
            next_seq,
            now,
        );
        enforce_monotonic(stop_times, fill_anchor, next_seq);
    }
}

/// Clear arrival times for stops the vehicle has already passed
/// (`seq < next_seq`) and for predictions that are now stale (`t < now`).
fn clear_passed_stops(stop_times: &mut [TripStopTime], next_seq: i64, now: i64) {
    for st in stop_times {
        if st.stop_sequence < next_seq {
            st.arrival_time = None;
            continue;
        }

        if st.arrival_time.is_some_and(|t| t < now) {
            st.arrival_time = None;
        }
    }
}

/// Backward-interpolate missing arrival times using the first known future
/// stop as an anchor.
fn interpolate_backward(
    stop_times: &mut [TripStopTime],
    schedule_offsets: &BTreeMap<i64, i64>,
    next_seq: i64,
    now: i64,
) {
    let Some(first) = stop_times
        .iter()
        .find(|st| st.stop_sequence > next_seq && st.arrival_time.is_some_and(|t| t > now))
    else {
        return;
    };

    let first_seq = first.stop_sequence;
    let Some(first_time) = first.arrival_time else {
        return;
    };
    let Some(&first_offset) = schedule_offsets.get(&first_seq) else {
        return;
    };

    for st in stop_times {
        if st.stop_sequence <= next_seq
            || st.stop_sequence >= first_seq
            || st.arrival_time.is_some()
        {
            continue;
        }

        let Some(&offset) = schedule_offsets.get(&st.stop_sequence) else {
            continue;
        };

        let filled = first_time - (first_offset - offset);
        if filled >= now {
            st.arrival_time = Some(filled);
        }
    }
}

/// Forward-propagate arrival times from the vehicle's own ETA (`fill_anchor`).
fn propagate_forward(
    stop_times: &mut [TripStopTime],
    schedule_offsets: &BTreeMap<i64, i64>,
    fill_anchor: i64,
    anchor_offset: i64,
    next_seq: i64,
    now: i64,
) {
    let mut last_time = fill_anchor;
    let mut last_offset = anchor_offset;

    for st in stop_times {
        if st.stop_sequence <= next_seq {
            continue;
        }

        let Some(&offset) = schedule_offsets.get(&st.stop_sequence) else {
            continue;
        };

        if st.arrival_time.is_some_and(|t| t > now) {
            let t = st.arrival_time.unwrap_or(last_time).max(last_time);
            st.arrival_time = Some(t);
            last_time = t;
            last_offset = offset;
            continue;
        }

        let filled = (last_time + (offset - last_offset)).max(last_time);
        st.arrival_time = Some(filled);
        last_time = filled;
        last_offset = offset;
    }
}

/// Enforce monotonically non-decreasing arrival times from `next_seq` onward.
fn enforce_monotonic(stop_times: &mut [TripStopTime], fill_anchor: i64, next_seq: i64) {
    let mut max_time = fill_anchor;

    for st in stop_times {
        if st.stop_sequence < next_seq {
            continue;
        }

        let Some(t) = st.arrival_time else {
            continue;
        };

        if t < max_time {
            st.arrival_time = Some(max_time);
        }

        max_time = max_time.max(st.arrival_time.unwrap_or(max_time));
    }
}
