#[macro_export]
macro_rules! sqlx_int_enum_decode {
    ($ty:ty, | $val:ident | $try_from:expr) => {
        impl TryFrom<i64> for $ty {
            type Error = sqlx::error::BoxDynError;
            fn try_from(val: i64) -> Result<Self, Self::Error> {
                let $val = val;
                $try_from
            }
        }
    };
}
