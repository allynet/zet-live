use std::net::SocketAddr;

use listenfd::ListenFd;
use tokio::net::TcpListener;
use tracing::{debug, error, info};

mod request;
mod routes;

use crate::{
    cli::ServerConfig,
    proto::{
        gtfs_realtime::fetcher::spawn_feed_fetcher,
        gtfs_schedule::fetcher::{spawn_schedule_fetcher, wait_for_schedule_update},
    },
};

pub async fn run(server_config: &ServerConfig) {
    debug!("Starting server");
    spawn_feed_fetcher();
    spawn_schedule_fetcher();

    info!("Waiting for schedule info");
    wait_for_schedule_update().await;

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
        std::process::exit(1);
    }
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
