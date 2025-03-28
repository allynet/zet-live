use std::env;

use tracing::{Level, warn};
use tracing_subscriber::{EnvFilter, filter::Directive, fmt, prelude::*};

static RELOAD_HANDLE: once_cell::sync::OnceCell<
    tracing_subscriber::reload::Handle<
        EnvFilter,
        tracing_subscriber::layer::Layered<
            fmt::Layer<tracing_subscriber::Registry>,
            tracing_subscriber::Registry,
        >,
    >,
> = once_cell::sync::OnceCell::new();

pub const COMPONENT_LEVELS: &[(&str, Level)] = &[
    // Binaries
    ("zet_live", Level::INFO),
    // Libraries
    // Other
    ("app", Level::INFO),
    ("request", Level::INFO),
    // External
];

/// Initialize the logger
///
/// # Panics
/// Panics if the logger fails to initialize
pub fn init() {
    init_with(COMPONENT_LEVELS.to_vec());
}

pub fn init_with<T>(levels: T)
where
    T: IntoIterator<Item = (&'static str, Level)>,
{
    let default_levels = levels
        .into_iter()
        .map(|(k, v)| {
            if k.is_empty() {
                v.to_string()
            } else {
                format!("{}={}", k, v)
            }
        })
        .fold(String::new(), |acc, a| format!("{},{}", acc, a));

    let mut base_level = EnvFilter::builder()
        .with_default_directive(Level::WARN.into())
        .parse_lossy(default_levels);

    let env_directives = env::var("LOG_LEVEL")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|s| match s.parse() {
            Ok(d) => Some(d),
            Err(e) => {
                eprintln!("Failed to parse log level directive {s:?}: {e:?}");
                None
            }
        })
        .collect::<Vec<Directive>>();

    for d in env_directives {
        base_level = base_level.add_directive(d);
    }

    let (base_level, reload_handle) = tracing_subscriber::reload::Layer::new(base_level);
    RELOAD_HANDLE
        .set(reload_handle)
        .expect("Logger was already initialized");

    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(base_level)
        .try_init()
        .expect("setting default subscriber failed");
}

pub fn update_log_level(log_level: &str) -> Result<(), Box<dyn std::error::Error>> {
    let default_levels = COMPONENT_LEVELS
        .iter()
        .map(|(k, v)| {
            if k.is_empty() {
                v.to_string()
            } else {
                format!("{}={}", k, v)
            }
        })
        .fold(String::new(), |acc, a| format!("{},{}", acc, a));

    let mut base_level = EnvFilter::builder()
        .with_default_directive(Level::WARN.into())
        .parse_lossy(default_levels);

    let env_directives = log_level
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|s| match s.parse() {
            Ok(d) => Some(d),
            Err(err) => {
                warn!(directive = ?s, ?err, "Failed to parse log level directive");
                None
            }
        })
        .collect::<Vec<Directive>>();

    for d in env_directives {
        base_level = base_level.add_directive(d);
    }

    let reload_handle = RELOAD_HANDLE.get().expect("Logger was not initialized");

    reload_handle
        .modify(|filter| *filter = base_level)
        .map_err(|e| format!("Failed to set log level: {:?}", e).into())
}
