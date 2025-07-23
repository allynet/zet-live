#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::{FileData, WheelchairBoarding};
use crate::proto::gtfs_schedule::data::QueryData;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trip {
    #[serde(alias = "trip_id")]
    pub id: String,
    #[serde(alias = "route_id")]
    pub route_id: u32,
    #[serde(alias = "service_id")]
    pub service_id: String,
    #[serde(alias = "trip_headsign")]
    pub headsign: Option<String>,
    #[serde(alias = "trip_short_name")]
    pub short_name: Option<String>,
    #[serde(alias = "direction_id")]
    pub direction_id: Option<Direction>,
    #[serde(alias = "block_id")]
    pub block_id: Option<String>,
    #[serde(alias = "shape_id")]
    pub shape_id: Option<String>,
    #[serde(default)]
    #[serde(alias = "wheelchair_accessible")]
    pub wheelchair_boarding: WheelchairBoarding,
    #[serde(default)]
    #[serde(alias = "bikes_allowed")]
    pub bikes_allowed: BikesAllowed,
    #[serde(default)]
    #[serde(alias = "stop_ids")]
    pub stop_ids: Vec<String>,
}

impl FileData for Trip {
    fn file_name() -> &'static str {
        "trips.txt"
    }

    fn table_name() -> &'static str {
        "gtfs_trips"
    }

    fn into_insert_query(self) -> QueryData {
        let query = "
        insert into
            gtfs_trips
                ( trip_id
                , route_id
                , service_id
                , trip_headsign
                , trip_short_name
                , direction_id
                , block_id
                , shape_id
                , wheelchair_boarding
                , bikes_allowed
                )
            values
                ( :trip_id
                , :route_id
                , :service_id
                , :trip_headsign
                , :trip_short_name
                , :direction_id
                , :block_id
                , :shape_id
                , :wheelchair_boarding
                , :bikes_allowed
                )
        ";

        let params = libsql::named_params! {
            ":trip_id": self.id.to_string(),
            ":route_id": self.route_id,
            ":service_id": self.service_id,
            ":trip_headsign": self.headsign,
            ":trip_short_name": self.short_name,
            ":direction_id": self.direction_id.map(|x| x as u8),
            ":block_id": self.block_id,
            ":shape_id": self.shape_id,
            ":wheelchair_boarding": self.wheelchair_boarding as u8,
            ":bikes_allowed": self.bikes_allowed as u8,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum Direction {
    Outbound = 0,
    Inbound = 1,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum BikesAllowed {
    #[default]
    Unknown = 0,
    Allowed = 1,
    NotAllowed = 2,
}
