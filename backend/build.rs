use std::io::Result;
fn main() -> Result<()> {
    let mut config = prost_build::Config::new();
    config.type_attribute(".", "#[derive(serde::Serialize)]");
    config.type_attribute(".", "#[serde(rename_all = \"camelCase\")]");
    config.include_file("_gtfs_realtime.rs");
    config.compile_protos(&["protobuf/gtfs-realtime.proto"], &["protobuf/"])?;
    Ok(())
}
