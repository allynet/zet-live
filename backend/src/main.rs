use cli::{CliCommands, Config};
use tracing::{error, info, trace};

mod cli;
mod entity;
mod logger;
mod proto;
mod server;

fn main() {
    match dotenvy::dotenv() {
        Ok(_) => {}
        Err(e) if e.not_found() => {}
        Err(e) => {
            eprintln!("Failed to load .env file: {}", e);
        }
    }
    logger::init();

    let config = match Config::init() {
        Err(err) => {
            error!(?err, "Failed to initialize CLI args");
            std::process::exit(1);
        }
        Ok(x) => x,
    };

    if let Some(log_level) = config.global.log_level.as_ref() {
        if let Err(e) = logger::update_log_level(log_level) {
            error!(?e, "Failed to update log level");
        }
    }

    info!("Running zet-live");

    trace!(?config, "CLI args initialized");

    match config.cmd {
        CliCommands::Server(ref server_config) => {
            let runtime = match tokio::runtime::Runtime::new() {
                Ok(x) => x,
                Err(err) => {
                    error!(?err, "Failed to create tokio runtime");
                    std::process::exit(1);
                }
            };

            runtime.block_on(server::run(server_config));
        }
    }
}
