#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::FileData;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Stop {
    #[serde(rename = "stop_id")]
    pub id: String,
    #[serde(rename = "stop_code")]
    pub code: Option<String>,
    #[serde(rename = "stop_name")]
    pub name: Option<String>,
    #[serde(rename = "tts_stop_name")]
    pub tts_name: Option<String>,
    #[serde(rename = "stop_lat")]
    pub latitude: Option<f64>,
    #[serde(rename = "stop_lon")]
    pub longitude: Option<f64>,
    pub zone_id: Option<String>,
    #[serde(rename = "stop_url")]
    pub url: Option<url::Url>,
    pub location_type: Option<LocationType>,
    pub parent_station: Option<String>,
    #[serde(rename = "stop_timezone")]
    pub timezone: Option<String>,
    pub wheelchair_boarding: Option<WheelchairBoarding>,
    pub level_id: Option<String>,
    pub platform_code: Option<String>,
}

impl FileData for Stop {
    fn file_name() -> &'static str {
        "stops.txt"
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum LocationType {
    Stop = 0,
    Station = 1,
    EntranceOrExit = 2,
    GenericNode = 3,
    BoardingArea = 4,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum WheelchairBoarding {
    Unknown = 0,
    Some = 1,
    None = 2,
}
