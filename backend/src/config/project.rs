use build_info::BuildInfo;

pub static APPLICATION_NAME: &str = match option_env!("APPLICATION_NAME") {
    Some(name) => name,
    None => "zet-live",
};
pub static APPLICATION_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const APPLICATION_NAME_WITH_VERSION: &str =
    build_info::format!("{} v{}", $.crate_info.name, $.crate_info.version);
pub const BUILD_DATE: &str = build_info::format!("{:?}", $.timestamp);
pub const BUILD_RUSTC_VERSION: &str = build_info::format!("{}", $.compiler.version);
pub const APP_WITH_BUILD_DATE: &str =
    build_info::format!("{} v{} ({})", $.crate_info.name, $.crate_info.version, $.timestamp);

pub struct ProjectConfig;
impl ProjectConfig {
    pub const fn build_date() -> &'static str {
        BUILD_DATE
    }

    pub const fn rustc_version() -> &'static str {
        BUILD_RUSTC_VERSION
    }

    pub const fn app_name_with_version() -> &'static str {
        APPLICATION_NAME_WITH_VERSION
    }

    pub const fn app_and_build_date() -> &'static str {
        APP_WITH_BUILD_DATE
    }

    pub const fn app_version() -> &'static str {
        APPLICATION_VERSION
    }

    pub const fn app_name() -> &'static str {
        APPLICATION_NAME
    }

    pub fn build_info() -> &'static BuildInfo {
        build_info_function()
    }
}

build_info::build_info!(fn build_info_function);
