#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};

use super::FileData;
use crate::proto::gtfs_schedule::data::QueryData;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shape {
    #[serde(alias = "shape_id")]
    pub id: String,
    #[serde(alias = "shape_pt_lat")]
    pub latitude: f32,
    #[serde(alias = "shape_pt_lon")]
    pub longitude: f32,
    #[serde(alias = "shape_pt_sequence")]
    pub sequence: u32,
    #[serde(alias = "shape_dist_traveled")]
    pub distance: Option<f32>,
}

impl FileData for Shape {
    fn file_name() -> &'static str {
        "shapes.txt"
    }

    fn table_name() -> &'static str {
        "gtfs_shapes"
    }

    fn into_insert_query(self) -> QueryData {
        let query = "
        insert into
            gtfs_shapes
                ( shape_id
                , shape_pt_lat
                , shape_pt_lon
                , shape_pt_sequence
                , shape_dist_traveled
                )
            values
                ( :shape_id
                , :shape_pt_lat
                , :shape_pt_lon
                , :shape_pt_sequence
                , :shape_dist_traveled
                )
        ";

        let params = libsql::named_params! {
            ":shape_id": self.id.to_string(),
            ":shape_pt_lat": self.latitude,
            ":shape_pt_lon": self.longitude,
            ":shape_pt_sequence": self.sequence,
            ":shape_dist_traveled": self.distance,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleShape {
    pub latitude: f32,
    pub longitude: f32,
}

impl SimpleShape {
    pub const fn to_tuple(&self) -> (f32, f32) {
        (self.longitude, self.latitude)
    }
}

impl From<Shape> for SimpleShape {
    fn from(shape: Shape) -> Self {
        Self {
            latitude: shape.latitude,
            longitude: shape.longitude,
        }
    }
}
