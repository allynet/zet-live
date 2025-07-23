#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

use super::FileData;
use crate::proto::gtfs_schedule::data::QueryData;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    #[serde(alias = "route_id")]
    pub id: String,
    #[serde(alias = "agency_id")]
    pub agency_id: Option<String>,
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
    #[serde(alias = "color")]
    pub color: String,
    #[serde(default = "default_route_text_color")]
    #[serde(alias = "text_color")]
    pub text_color: String,
    #[serde(alias = "route_sort_order")]
    pub sort_order: Option<u32>,
    #[serde(default)]
    #[serde(alias = "continuous_pickup")]
    pub continuous_pickup: PickupType,
    #[serde(default)]
    #[serde(alias = "continuous_drop_off")]
    pub continuous_drop_off: DropOffType,
    #[serde(alias = "network_id")]
    pub network_id: Option<String>,
}

impl FileData for Route {
    fn file_name() -> &'static str {
        "routes.txt"
    }

    fn table_name() -> &'static str {
        "gtfs_routes"
    }

    fn into_insert_query(self) -> QueryData {
        let query = "
        insert into
            gtfs_routes
                ( route_id
                , agency_id
                , route_short_name
                , route_long_name
                , route_url
                , route_desc
                , route_type
                , route_color
                , route_text_color
                )
            values
                ( :route_id
                , :agency_id
                , :route_short_name
                , :route_long_name
                , :route_url
                , :route_desc
                , :route_type
                , :route_color
                , :route_text_color
                )
        ";

        let params = libsql::named_params! {
            ":route_id": self.id.to_string(),
            ":agency_id": self.agency_id,
            ":route_short_name": self.short_name,
            ":route_long_name": self.long_name,
            ":route_url": self.url.map(|x| x.to_string()),
            ":route_desc": self.desc,
            ":route_type": self.route_type as u8,
            ":route_color": self.color,
            ":route_text_color": self.text_color,
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

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize_repr, Deserialize_repr)]
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
