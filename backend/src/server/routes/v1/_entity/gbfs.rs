use crate::entity::util::mixed_value::MixedValue;

/// A GBFS station: `gbfs_stations` left-joined with `gbfs_station_status`.
///
/// Wire tuple order produced by [`Self::to_simple`] (indices must match the
/// frontend `GbfsStationV1.fromSimple` reader):
///
/// `0` `station_id` · `1` name · `2` lat · `3` lon · `4` `num_bikes_available` ·
/// `5` `num_docks_available` · `6` `is_renting` · `7` `is_returning` · `8` capacity
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GbfsStation {
    pub station_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub lat: f64,
    pub lon: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_bikes_available: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_docks_available: Option<i64>,
    pub is_renting: bool,
    pub is_returning: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capacity: Option<i64>,
}

impl GbfsStation {
    /// Compact tuple form for the WebSocket broadcast (CBOR via `Versioned`).
    /// Booleans are encoded as `0`/`1` since `MixedValue` has no bool variant.
    #[must_use]
    pub fn to_simple(&self) -> Vec<MixedValue> {
        vec![
            self.station_id.clone().into(),
            self.name
                .as_deref()
                .map_or(MixedValue::null(), MixedValue::from),
            self.lat.into(),
            self.lon.into(),
            self.num_bikes_available
                .map_or(MixedValue::null(), MixedValue::I64),
            self.num_docks_available
                .map_or(MixedValue::null(), MixedValue::I64),
            MixedValue::I64(i64::from(self.is_renting)),
            MixedValue::I64(i64::from(self.is_returning)),
            self.capacity.map_or(MixedValue::null(), MixedValue::I64),
        ]
    }
}
