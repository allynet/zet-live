use std::net::SocketAddr;

use listenfd::ListenFd;
use tokio::net::TcpListener;
use tracing::{debug, error, info};

mod request;
mod routes;

use crate::{
    cli::ServerConfig,
    proto::{
        gtfs_realtime::fetcher::{spawn_feed_fetcher, wait_for_feed_update},
        gtfs_schedule::fetcher::{spawn_schedule_fetcher, wait_for_schedule_update},
    },
};

pub async fn run(server_config: &ServerConfig) -> Result<(), Box<dyn std::error::Error>> {
    debug!("Starting server");
    spawn_feed_fetcher();
    spawn_schedule_fetcher();

    info!("Waiting for initial schedule info and feed");
    let initial_join_set = {
        let mut s = tokio::task::JoinSet::new();
        s.spawn(async move {
            wait_for_schedule_update().await;
        });
        s.spawn(async move {
            wait_for_feed_update().await;
        });
        s
    };
    initial_join_set.join_all().await;

    let app = routes::create_router();

    let listener = create_listener(server_config).await;
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

async fn create_listener(server_config: &ServerConfig) -> TcpListener {
    let mut listenfd = ListenFd::from_env();
    if let Ok(Some(listener)) = listenfd.take_tcp_listener(0) {
        debug!("Using socket from listenfd");
        return TcpListener::from_std(listener)
            .expect("Failed to convert listenfd listener to TcpListener");
    }

    let address = match server_config.address() {
        Ok(x) => x,
        Err(e) => {
            error!(?e, "Failed to parse server address");
            std::process::exit(1);
        }
    };

    match TcpListener::bind(address).await {
        Ok(x) => x,
        Err(e) => {
            error!(?e, "Failed to bind to address");
            std::process::exit(1);
        }
    }
}
