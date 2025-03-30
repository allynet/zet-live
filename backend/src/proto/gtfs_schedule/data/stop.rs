#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::FileData;
use crate::entity::util::mixed_value::MixedValue;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stop {
    #[serde(alias = "stop_id")]
    pub id: String,
    #[serde(alias = "stop_code")]
    pub code: Option<String>,
    #[serde(alias = "stop_name")]
    pub name: Option<String>,
    #[serde(alias = "tts_stop_name")]
    pub tts_name: Option<String>,
    #[serde(alias = "stop_lat")]
    pub latitude: Option<f32>,
    #[serde(alias = "stop_lon")]
    pub longitude: Option<f32>,
    #[serde(alias = "zone_id")]
    pub zone_id: Option<String>,
    #[serde(alias = "stop_url")]
    pub url: Option<url::Url>,
    #[serde(alias = "location_type")]
    pub location_type: Option<LocationType>,
    #[serde(alias = "parent_station")]
    pub parent_station: Option<String>,
    #[serde(alias = "stop_timezone")]
    pub timezone: Option<String>,
    #[serde(default)]
    #[serde(alias = "wheelchair_boarding")]
    pub wheelchair_boarding: WheelchairBoarding,
    #[serde(alias = "level_id")]
    pub level_id: Option<String>,
    #[serde(alias = "platform_code")]
    pub platform_code: Option<String>,
    #[serde(default)]
    pub trip_ids_stop_here: Vec<String>,
}

impl FileData for Stop {
    fn file_name() -> &'static str {
        "stops.txt"
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleStop {
    pub id: String,
    pub name: String,
    pub latitude: f32,
    pub longitude: f32,
}

impl SimpleStop {
    pub fn into_vec(self) -> Vec<MixedValue> {
        vec![
            self.id.into(),
            self.name.into(),
            self.latitude.into(),
            self.longitude.into(),
        ]
    }
}

impl From<Stop> for SimpleStop {
    fn from(stop: Stop) -> Self {
        Self {
            id: stop.id,
            name: stop.name.unwrap_or_default(),
            latitude: stop.latitude.unwrap_or_default(),
            longitude: stop.longitude.unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum LocationType {
    /// Stop (or Platform). A location where passengers board or disembark from a transit vehicle. Is called a platform when defined within a `parent_station`.
    Stop = 0,
    /// Station. A physical structure or area that contains one or more platform.
    Station = 1,
    /// Entrance/Exit. A location where passengers can enter or exit a station from the street. If an entrance/exit belongs to multiple stations, it may be linked by pathways to both, but the data provider must pick one of them as parent.
    EntranceOrExit = 2,
    /// Generic Node. A location within a station, not matching any other `location_type`, that may be used to link together pathways define in pathways.txt.
    GenericNode = 3,
    /// Boarding Area. A specific location on a platform, where passengers can board and/or alight vehicles.
    BoardingArea = 4,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
/// Indicates whether wheelchair boardings are possible from the location
pub enum WheelchairBoarding {
    /// No accessibility information for the stop.
    #[default]
    Unknown = 0,
    /// Some vehicles at this stop can be boarded by a rider in a wheelchair.
    Some = 1,
    /// Wheelchair boarding is not possible at this stop.
    None = 2,
}
