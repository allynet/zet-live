use serde::Deserialize;

use super::GbfsFeed;
use crate::database::Database;

/// `free_bike_status.json` — `data.bikes`. Realtime free-floating bike positions.
#[derive(Debug, Deserialize)]
pub struct Bike {
    pub bike_id: String,
    #[serde(default)]
    pub lat: Option<f64>,
    #[serde(default)]
    pub lon: Option<f64>,
    #[serde(default)]
    pub is_reserved: bool,
    #[serde(default)]
    pub is_disabled: bool,
    #[serde(default)]
    pub vehicle_type_id: Option<String>,
    #[serde(default)]
    pub station_id: Option<String>,
    #[serde(default)]
    pub pricing_plan_id: Option<String>,
    #[serde(default)]
    pub rental_uris: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct FreeBikeStatusData {
    #[serde(default)]
    pub bikes: Vec<Bike>,
}

pub struct Feed;

#[async_trait::async_trait]
impl GbfsFeed for Feed {
    const FEED_NAME: &str = "free_bike_status";
    const METADATA_NAME: &str = "gbfs_free_bike_status_fetch";
    type Data = FreeBikeStatusData;

    async fn write(data: Self::Data) -> anyhow::Result<usize> {
        let mut tx = Database::pool().begin().await?;

        sqlx::query!("DELETE FROM gbfs_free_bikes")
            .execute(&mut *tx)
            .await?;

        for bike in &data.bikes {
            let rental_uris = match &bike.rental_uris {
                Some(value) => Some(serde_json::to_string(value)?),
                None => None,
            };

            sqlx::query!(
                "
                INSERT INTO
                gbfs_free_bikes
                    ( bike_id
                    , lat
                    , lon
                    , is_reserved
                    , is_disabled
                    , vehicle_type_id
                    , station_id
                    , pricing_plan_id
                    , rental_uris
                    )
                VALUES
                    ( ?
                    , ?
                    , ?
                    , ?
                    , ?
                    , ?
                    , ?
                    , ?
                    , ?
                    )
                ",
                bike.bike_id,
                bike.lat,
                bike.lon,
                i64::from(bike.is_reserved),
                i64::from(bike.is_disabled),
                bike.vehicle_type_id,
                bike.station_id,
                bike.pricing_plan_id,
                rental_uris,
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(data.bikes.len())
    }
}
