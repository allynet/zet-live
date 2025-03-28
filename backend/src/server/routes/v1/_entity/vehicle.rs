use crate::{
    entity::util::mixed_value::MixedValue,
    proto::gtfs_realtime::data::transit_realtime::VehiclePosition,
};

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Vehicle {
    pub id: String,
    pub route_id: String,
    pub trip_id: String,
    pub latitude: f32,
    pub longitude: f32,
}

impl Vehicle {
    pub fn to_simple(&self) -> Vec<MixedValue> {
        vec![
            self.id.clone().into(),
            self.route_id.clone().into(),
            self.trip_id.clone().into(),
            self.latitude.into(),
            self.longitude.into(),
        ]
    }
}

impl TryFrom<VehiclePosition> for Vehicle {
    type Error = VehicleError;

    fn try_from(value: VehiclePosition) -> Result<Self, Self::Error> {
        value.try_into()
    }
}

impl TryFrom<&VehiclePosition> for Vehicle {
    type Error = VehicleError;

    fn try_from(value: &VehiclePosition) -> Result<Self, Self::Error> {
        let Some(vehicle_info) = value.vehicle.as_ref() else {
            return Err(VehicleError::MissingVehicleInfo);
        };

        let Some(trip_info) = value.trip.as_ref() else {
            return Err(VehicleError::MissingTripInfo);
        };

        let Some(position_info) = value.position else {
            return Err(VehicleError::MissingPositionInfo);
        };

        Ok(Self {
            id: vehicle_info.id().to_string(),
            route_id: trip_info.route_id().to_string(),
            trip_id: trip_info.trip_id().to_string(),
            latitude: position_info.latitude,
            longitude: position_info.longitude,
        })
    }
}

#[derive(Debug, thiserror::Error)]
#[allow(clippy::enum_variant_names)]
pub enum VehicleError {
    #[error("Missing vehicle info")]
    MissingVehicleInfo,

    #[error("Missing trip info")]
    MissingTripInfo,

    #[error("Missing position info")]
    MissingPositionInfo,
}
