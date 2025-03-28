#[derive(Debug, serde::Serialize)]
pub struct Versioned<T> {
    #[serde(rename = "v")]
    pub version: u64,
    #[serde(rename = "ts", skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
    #[serde(rename = "d")]
    pub data: T,
}

impl<T> Versioned<T> {
    pub const fn new(version: u64, data: T) -> Self {
        Self {
            version,
            timestamp: None,
            data,
        }
    }

    pub fn new_now(version: u64, data: T) -> Self {
        Self::new(version, data).with_timestamp_now()
    }

    pub const fn new_with_timestamp(version: u64, timestamp: u64, data: T) -> Self {
        Self {
            version,
            timestamp: Some(timestamp),
            data,
        }
    }

    pub fn with_timestamp(self, timestamp: u64) -> Self {
        Self {
            version: self.version,
            timestamp: Some(timestamp),
            data: self.data,
        }
    }

    pub fn with_timestamp_now(self) -> Self {
        self.with_timestamp(timestamp_now())
    }
}

fn timestamp_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards really badly")
        .as_secs()
}
