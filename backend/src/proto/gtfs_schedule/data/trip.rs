#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::{FileData, WheelchairBoarding};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Trip {
    #[serde(rename = "trip_id")]
    pub id: String,
    pub route_id: u32,
    pub service_id: String,
    #[serde(rename = "trip_headsign")]
    pub headsign: Option<String>,
    #[serde(rename = "trip_short_name")]
    pub short_name: Option<String>,
    pub direction_id: Option<Direction>,
    pub block_id: Option<String>,
    pub shape_id: Option<String>,
    #[serde(rename = "wheelchair_accessible")]
    pub wheelchair_boarding: Option<WheelchairBoarding>,
    pub bikes_allowed: Option<BikesAllowed>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum BikesAllowed {
    Unknown = 0,
    Allowed = 1,
    NotAllowed = 2,
}
