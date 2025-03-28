#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(untagged)]
pub enum MixedValue {
    String(String),
    U32(u32),
    F32(f32),
}

impl From<String> for MixedValue {
    fn from(value: String) -> Self {
        Self::String(value)
    }
}
impl From<&str> for MixedValue {
    fn from(value: &str) -> Self {
        Self::String(value.to_string())
    }
}

impl From<u32> for MixedValue {
    fn from(value: u32) -> Self {
        Self::U32(value)
    }
}

impl From<f32> for MixedValue {
    fn from(value: f32) -> Self {
        Self::F32(value)
    }
}
