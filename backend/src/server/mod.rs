use std::net::SocketAddr;

use listenfd::ListenFd;
use tokio::net::TcpListener;
use tracing::{debug, error, info};

mod request;
mod routes;

use crate::{
    cli::ServerConfig,
    database::Database,
    proto::{
        gtfs_realtime::fetcher::spawn_feed_fetcher, gtfs_schedule::fetcher::spawn_schedule_fetcher,
    },
};

pub async fn run(server_config: &ServerConfig) -> Result<(), Box<dyn std::error::Error>> {
    debug!("Starting server");

    if let Err(e) = Database::init(&server_config.database_url).await {
        error!(%e, "Failed to initialize database");
        return Err(format!("Failed to initialize database: {e}").into());
    }

    spawn_feed_fetcher();
    spawn_schedule_fetcher();

    info!("Waiting for initial schedule info and feed");
    {
        let mut js = {
            let mut s = tokio::task::JoinSet::new();
            s.spawn(async move {
                crate::proto::gtfs_schedule::fetcher::wait_for_schedule_update().await;
            });
            s.spawn(async move {
                crate::proto::gtfs_realtime::fetcher::wait_for_feed_update().await;
            });
            s
        };

        while let Some(x) = js.join_next().await {
            x?;
        }
    }

    let app = routes::create_router();

    let listener = create_listener(server_config).await?;
    info!(
        "Started listening on http://{}",
        listener.local_addr().expect("Failed to get local address")
    );

    if let Err(e) = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    {
        error!(?e, "Failed to start server");
        return Err(e.into());
    }

    Ok(())
}

async fn create_listener(
    server_config: &ServerConfig,
) -> Result<TcpListener, Box<dyn std::error::Error>> {
    let mut listenfd = ListenFd::from_env();
    if let Ok(Some(listener)) = listenfd.take_tcp_listener(0) {
        debug!("Using socket from listenfd");
        return TcpListener::from_std(listener).map_err(Into::into);
    }

    let address = match server_config.address() {
        Ok(x) => x,
        Err(e) => {
            error!(?e, "Failed to parse server address");
            return Err(format!("Failed to parse server address: {e}").into());
        }
    };

    match TcpListener::bind(address).await {
        Ok(x) => Ok(x),
        Err(e) => {
            error!(?e, "Failed to bind to address");

            Err(format!("Failed to bind to address {address:?}: {e}").into())
        }
    }
}
