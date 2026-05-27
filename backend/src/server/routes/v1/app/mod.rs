use std::sync::LazyLock;

use axum::Json;
use sha2::Digest;

use crate::config::project::ProjectConfig;

pub async fn get_version() -> Json<serde_json::Value> {
    static INFO: LazyLock<serde_json::Value> = LazyLock::new(|| {
        let info = ProjectConfig::build_info();

        let commit = info
            .version_control
            .as_ref()
            .and_then(|x| match x {
                build_info::VersionControl::Git(git_info) => Some(git_info),
                #[allow(unreachable_patterns)]
                _ => None,
            })
            .map(|x| x.commit_id.clone());

        let id = {
            let mut hasher = sha2::Sha256::new();
            hasher.update(ProjectConfig::app_and_build_date().as_bytes());
            hex::encode(hasher.finalize())
        };

        let mut ret = serde_json::json!({
            "name": ProjectConfig::app_name(),
            "version": ProjectConfig::app_version(),
            "built": ProjectConfig::build_date(),
            "id": id,
        });
        let ret = ret.as_object_mut().expect("Value is object");

        if cfg!(debug_assertions) {
            ret.insert("_build".to_string(), serde_json::json!(info));
        }

        if let Some(commit) = commit {
            ret.insert("commit".to_string(), serde_json::json!(commit));
        }

        serde_json::json!(ret)
    });

    return Json(INFO.clone());
}
