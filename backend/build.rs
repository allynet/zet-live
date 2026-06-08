use std::io::Result;
fn main() -> Result<()> {
    let mut config = prost_build::Config::new();
    config.type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]");
    config.type_attribute(".", "#[serde(rename_all = \"camelCase\")]");
    config.include_file("_gtfs_realtime.rs");
    config.compile_protos(&["protobuf/gtfs-realtime.proto"], &["protobuf/"])?;

    build_info_build::build_script();

    // Rerun build if sql migrations change
    println!("cargo:rerun-if-changed=migrations");

    Ok(())
}
