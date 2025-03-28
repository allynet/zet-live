#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::FileData;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Route {
    #[serde(alias = "route_id")]
    pub id: u32,
    #[serde(alias = "agency_id")]
    pub agency_id: Option<u32>,
    #[serde(alias = "route_short_name")]
    pub short_name: Option<String>,
    #[serde(alias = "route_long_name")]
    pub long_name: Option<String>,
    #[serde(alias = "route_desc")]
    pub desc: Option<String>,
    #[serde(alias = "route_type")]
    pub route_type: RouteType,
    #[serde(alias = "route_url")]
    pub url: Option<url::Url>,
    #[serde(default = "default_route_color")]
    pub color: String,
    #[serde(default = "default_route_text_color")]
    pub text_color: String,
    #[serde(alias = "route_sort_order")]
    pub sort_order: Option<u32>,
    #[serde(default)]
    pub continuous_pickup: ContinuousPickup,
    #[serde(default)]
    pub continuous_drop_off: ContinuousDropOff,
    pub network_id: Option<String>,
}

impl FileData for Route {
    fn file_name() -> &'static str {
        "routes.txt"
    }
}

fn default_route_color() -> String {
    "FFFFFF".to_string()
}

fn default_route_text_color() -> String {
    "000000".to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum RouteType {
    /// Tram, Streetcar, Light rail. Any light rail or street level system within a metropolitan area.
    Tram = 0,
    /// Subway, Metro. Any underground rail system within a metropolitan area.
    Subway = 1,
    /// Rail. Used for intercity and long-distance travel.
    Rail = 2,
    /// Bus. Used for short- and long-distance bus routes.
    Bus = 3,
    /// Ferry. Used for short- and long-distance boat service.
    Ferry = 4,
    /// Cable tram. Used for street-level rail cars where the cable runs beneath the vehicle (e.g., cable car in San Francisco).
    CableTram = 5,
    /// Aerial lift, suspended cable car (e.g., gondola lift, aerial tramway). Cable transport where cabins, cars, gondolas or open chairs are suspended by means of one or more cables.
    Gondola = 6,
    /// Funicular. Any rail system designed for steep inclines.
    Funicular = 7,
    /// Trolleybus. Electric buses that draw power from overhead wires using poles.
    Trolley = 11,
    /// Monorail. Railway in which the track consists of a single rail or a beam.
    Monorail = 12,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum ContinuousPickup {
    /// Continuous stopping pickup.
    Continuous = 0,
    /// No continuous stopping pickup.
    #[default]
    None = 1,
    /// Must phone agency to arrange continuous stopping pickup.
    CallAgency = 2,
    /// Must coordinate with driver to arrange continuous stopping pickup.
    CoordinateWithDriver = 3,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum ContinuousDropOff {
    /// Continuous stopping drop off.
    Continuous = 0,
    /// No continuous stopping drop off.
    #[default]
    None = 1,
    /// Must coordinate with driver to arrange continuous stopping drop off.
    CoordinateWithDriver = 2,
}
