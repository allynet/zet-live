use crate::{
    entity::util::mixed_value::MixedValue,
    proto::gtfs_realtime::data::transit_realtime::VehiclePosition,
};

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Vehicle {
    pub id: u32,
    pub route_id: u32,
    pub trip_id: String,
    pub latitude: f32,
    pub longitude: f32,
}

impl Vehicle {
    pub fn to_simple(&self) -> Vec<MixedValue> {
        vec![
            self.id.into(),
            self.route_id.into(),
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

        let route_id = match trip_info.route_id().parse() {
            Ok(x) => x,
            Err(e) => {
                return Err(VehicleError::InvalidRouteId(e));
            }
        };

        let id = match vehicle_info.id().parse() {
            Ok(x) => x,
            Err(e) => {
                return Err(VehicleError::InvalidId(e));
            }
        };

        Ok(Self {
            id,
            route_id,
            trip_id: trip_info.trip_id().to_string(),
            latitude: position_info.latitude,
            longitude: position_info.longitude,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum VehicleError {
    #[error("Missing vehicle info")]
    MissingVehicleInfo,

    #[error("Missing trip info")]
    MissingTripInfo,

    #[error("Missing position info")]
    MissingPositionInfo,

    #[error("Invalid route id: {0}")]
    InvalidRouteId(std::num::ParseIntError),

    #[error("Invalid id: {0}")]
    InvalidId(std::num::ParseIntError),
}
