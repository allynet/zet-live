#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::{FileData, WheelchairBoarding};

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
}

impl FileData for Trip {
    fn file_name() -> &'static str {
        "trips.txt"
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
