#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};

use super::FileData;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shape {
    #[serde(alias = "shape_id")]
    pub id: String,
    #[serde(alias = "shape_pt_lat")]
    pub latitude: f64,
    #[serde(alias = "shape_pt_lon")]
    pub longitude: f64,
    #[serde(alias = "shape_pt_sequence")]
    pub sequence: u32,
    #[serde(alias = "shape_dist_traveled")]
    pub distance: Option<f64>,
}

impl FileData for Shape {
    fn file_name() -> &'static str {
        "shapes.txt"
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleShape {
    pub latitude: f64,
    pub longitude: f64,
}

impl SimpleShape {
    pub const fn to_tuple(&self) -> (f64, f64) {
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
