#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::FileData;
use crate::{proto::gtfs_schedule::data::BulkInsert, sqlx_int_enum_decode};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    #[serde(alias = "route_id")]
    pub id: String,
    #[serde(alias = "agency_id", default)]
    pub agency_id: Option<String>,
    #[serde(alias = "route_short_name", default)]
    pub short_name: Option<String>,
    #[serde(alias = "route_long_name", default)]
    pub long_name: Option<String>,
    #[serde(alias = "route_desc", default)]
    pub desc: Option<String>,
    #[serde(alias = "route_type", default)]
    pub route_type: Option<RouteType>,
    #[serde(alias = "route_url")]
    pub url: Option<url::Url>,
    #[serde(alias = "route_color", default = "Route::default_route_color")]
    pub color: String,
    #[serde(
        alias = "route_text_color",
        default = "Route::default_route_text_color"
    )]
    pub text_color: String,
    #[serde(alias = "route_sort_order", default)]
    #[sqlx(skip)]
    pub sort_order: Option<u32>,
    #[serde(alias = "continuous_pickup", default)]
    #[sqlx(skip)]
    pub continuous_pickup: PickupType,
    #[serde(alias = "continuous_drop_off", default)]
    #[sqlx(skip)]
    pub continuous_drop_off: DropOffType,
    #[serde(alias = "network_id", default)]
    #[sqlx(skip)]
    pub network_id: Option<String>,
}
impl Route {
    pub fn default_route_color() -> String {
        "FFFFFF".to_string()
    }

    pub fn default_route_text_color() -> String {
        "000000".to_string()
    }
}

impl FileData for Route {
    fn file_name() -> &'static str {
        "routes.txt"
    }

    fn table_name() -> &'static str {
        "gtfs_routes"
    }

    fn into_bulk_insert(self) -> BulkInsert {
        BulkInsert::Route(self)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Deserialize_repr, sqlx::Type)]
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

sqlx_int_enum_decode!(RouteType, |val| {
    match val {
        0 => Ok(RouteType::Tram),
        1 => Ok(RouteType::Subway),
        2 => Ok(RouteType::Rail),
        3 => Ok(RouteType::Bus),
        4 => Ok(RouteType::Ferry),
        5 => Ok(RouteType::CableTram),
        6 => Ok(RouteType::Gondola),
        7 => Ok(RouteType::Funicular),
        11 => Ok(RouteType::Trolley),
        12 => Ok(RouteType::Monorail),
        _ => Err(format!("unknown RouteType: {val}").into()),
    }
});

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Default, Serialize_repr, Deserialize_repr, sqlx::Type,
)]
#[repr(u8)]
pub enum PickupType {
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

sqlx_int_enum_decode!(PickupType, |val| {
    match val {
        0 => Ok(PickupType::Continuous),
        1 => Ok(PickupType::None),
        2 => Ok(PickupType::CallAgency),
        3 => Ok(PickupType::CoordinateWithDriver),
        _ => Err(format!("unknown PickupType: {val}").into()),
    }
});

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Default, Serialize_repr, Deserialize_repr, sqlx::Type,
)]
#[repr(u8)]
pub enum DropOffType {
    /// Continuous stopping drop off.
    Continuous = 0,
    /// No continuous stopping drop off.
    #[default]
    None = 1,
    /// Must coordinate with driver to arrange continuous stopping drop off.
    CoordinateWithDriver = 2,
}

sqlx_int_enum_decode!(DropOffType, |val| {
    match val {
        0 => Ok(DropOffType::Continuous),
        1 => Ok(DropOffType::None),
        2 => Ok(DropOffType::CoordinateWithDriver),
        _ => Err(format!("unknown DropOffType: {val}").into()),
    }
});
