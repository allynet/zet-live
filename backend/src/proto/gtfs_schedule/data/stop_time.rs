use serde::{Deserialize, Serialize};

use super::{DropOffType, FileData, PickupType};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StopTime {
    pub trip_id: String,
    pub arrival_time: Option<chrono::NaiveTime>,
    pub departure_time: Option<chrono::NaiveTime>,
    pub stop_id: String,
    pub stop_sequence: u32,
    pub stop_headsign: Option<String>,
    pub pickup_type: Option<PickupType>,
    pub drop_off_type: Option<DropOffType>,
    pub shape_dist_traveled: Option<f32>,
}

impl FileData for StopTime {
    fn file_name() -> &'static str {
        "stop_times.txt"
    }
}
