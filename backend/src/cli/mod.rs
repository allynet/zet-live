use std::sync::Arc;

use clap::{CommandFactory, Parser, ValueEnum};
use clap_complete::Shell;
use timeframe::Timeframe;
use validator::ValidationError;

mod timeframe;

static CLI_ARGS: once_cell::sync::OnceCell<Arc<Config>> = once_cell::sync::OnceCell::new();

#[derive(Debug, clap::Parser)]
#[clap(version)]
pub struct Config {
    #[clap(flatten)]
    pub global: GlobalConfig,

    #[clap(subcommand)]
    pub cmd: CliCommands,
}

impl Config {
    pub fn init() -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        CLI_ARGS
            .set(Arc::new(Self::parse()))
            .map(|()| Self::global())
            .map_err(|_| "Failed to initialize CLI args".into())
    }

    pub fn global() -> Arc<Self> {
        CLI_ARGS.get().expect("CLI args not initialized").clone()
    }
}

#[derive(Debug, clap::Args)]
pub struct GlobalConfig {
    /// Dump shell completions to stdout
    #[arg(
        long,
        default_value = None,
        value_name = "SHELL",
        value_parser = hacky_dump_completions()
    )]
    pub dump_completions: Option<Shell>,

    /// The log level to use.
    ///
    /// Can be a comma-separated list of loggers and their levels.
    /// Eg. `zet_live=trace,request=debug,warn`
    #[clap(long, env = "LOG_LEVEL")]
    pub log_level: Option<String>,

    #[clap(flatten)]
    pub data_fetcher: DataFetcherConfig,
}

#[derive(Debug, clap::Args)]
pub struct DataFetcherConfig {
    /// The endpoint to fetch the data from.
    /// Must be a valid URL to a GTFS Realtime endpoint.
    #[clap(
        long,
        default_value = "https://www.zet.hr/gtfs-rt-protobuf",
        env = "ZI_DATA_FETCH_ENDPOINT"
    )]
    pub data_fetch_endpoint: url::Url,

    /// The interval at which the data is fetched/checked from the endpoint.
    /// Depends on the endpoint, but for the ZET GTFS-RT endpoint, it's updated about every 10 seconds.
    ///
    /// The value represents a duration in seconds, minutes, hours, days, weeks, or months.
    /// Special events are ignored, eg. leap years, daylight savings, etc.
    /// `minute` is 60 seconds, `hour` is 60 minutes, `day` is 24 hours, `week` is 7 days, `month` is 30 days.
    /// Eg. 1d, 2 weeks, 3 months, 4h, 5mins, 6s
    #[clap(
        long,
        value_parser = Timeframe::parse_str,
        default_value = "2s",
        env = "ZI_DATA_FETCH_INTERVAL"
    )]
    pub data_fetch_interval: Timeframe,
}

#[derive(Debug, clap::Subcommand)]
pub enum CliCommands {
    Server(ServerConfig),
}

#[derive(Debug, clap::Args)]
pub struct ServerConfig {
    /// The port the server listens on.
    #[clap(short = 'P', long, default_value = "9011", env = "PORT")]
    pub port: u16,

    /// The host to bind the server to.
    ///
    /// Should usually be either `0.0.0.0` if you want to bind to all interfaces aka the public,
    /// or `127.0.0.1` if you don't want to expose the server to the outside world.
    #[clap(short = 'H', long, default_value = "0.0.0.0", env = "HOST")]
    pub host: String,
}
impl ServerConfig {
    pub fn address(&self) -> Result<std::net::SocketAddr, std::net::AddrParseError> {
        let host = self.host.parse::<std::net::IpAddr>()?;

        Ok(std::net::SocketAddr::new(host, self.port))
    }
}

#[must_use]
fn hacky_dump_completions() -> impl clap::builder::TypedValueParser {
    move |s: &str| {
        let parsed = Shell::from_str(s, true);

        if let Ok(shell) = &parsed {
            let bin_name = std::env::current_exe()
                .map_err(|_e| ValidationError::new("Unknown application name"))?
                .file_name()
                .map(|x| x.to_string_lossy().to_string())
                .ok_or_else(|| ValidationError::new("Unknown application name"))?;

            clap_complete::generate(
                *shell,
                &mut Config::command(),
                bin_name,
                &mut std::io::stdout(),
            );
            std::process::exit(0);
        }

        parsed
            .map(|_| ())
            .map_err(|_| ValidationError::new("Invalid shell"))
    }
}
