use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("This action is not allowed from the current window.")]
    Unauthorized,
    #[error("Setup is incomplete.")]
    SetupIncomplete,
    #[error("The saved configuration is corrupt. Retry or reset VisualCover.")]
    ConfigCorrupt,
    #[error("{0}")]
    InvalidInput(String),
    #[error("Current PIN is incorrect.")]
    IncorrectPin,
    #[error("VisualCover is busy. Please try again.")]
    Busy,
    #[error("Could not save VisualCover settings: {0}")]
    Persistence(String),
    #[error("Native operation failed: {0}")]
    Native(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
