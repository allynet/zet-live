use serde::{Deserialize, Serialize};

use super::{DropOffType, FileData, PickupType};
use crate::proto::gtfs_schedule::data::QueryData;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopTime {
    #[serde(alias = "trip_id")]
    pub trip_id: String,
    #[serde(alias = "arrival_time")]
    pub arrival_time: Option<chrono::NaiveTime>,
    #[serde(alias = "departure_time")]
    pub departure_time: Option<chrono::NaiveTime>,
    #[serde(alias = "stop_id")]
    pub stop_id: String,
    #[serde(alias = "stop_sequence")]
    pub stop_sequence: u32,
    #[serde(alias = "stop_headsign")]
    pub stop_headsign: Option<String>,
    #[serde(alias = "pickup_type")]
    pub pickup_type: Option<PickupType>,
    #[serde(alias = "drop_off_type")]
    pub drop_off_type: Option<DropOffType>,
    #[serde(alias = "shape_dist_traveled")]
    pub shape_dist_traveled: Option<f32>,
}

impl FileData for StopTime {
    fn file_name() -> &'static str {
        "stop_times.txt"
    }

    fn table_name() -> &'static str {
        "gtfs_stop_times"
    }

    fn into_insert_query(self) -> QueryData {
        let query = "
        insert into
            gtfs_stop_times
                ( trip_id
                , stop_id
                , stop_sequence
                , arrival_time
                , departure_time
                )
            values
                ( :trip_id
                , :stop_id
                , :stop_sequence
                , :arrival_time
                , :departure_time
                )
        ";

        let params = libsql::named_params! {
            ":trip_id": self.trip_id.to_string(),
            ":stop_id": self.stop_id.to_string(),
            ":stop_sequence": self.stop_sequence,
            ":arrival_time": self.arrival_time.map(|x| x.to_string()),
            ":departure_time": self.departure_time.map(|x| x.to_string()),
        }
        .into_iter()
        .map(|(x, y)| (x.to_string(), y))
        .collect::<Vec<_>>();

        QueryData {
            query: query.to_string(),
            params,
        }
    }
}
