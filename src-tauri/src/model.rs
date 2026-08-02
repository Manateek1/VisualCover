use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const CONFIG_SCHEMA_VERSION: u8 = 1;
pub const DEFAULT_EMERGENCY_SHORTCUT: &str = "Ctrl+Alt+Shift+U";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CoverLifecycle {
    Uncovered,
    Covering,
    Covered,
    Uncovering,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConfigStatus {
    Ok,
    RecoveredFromBackup,
    Corrupt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Platform {
    #[serde(rename = "windows")]
    Windows,
    #[serde(rename = "macos")]
    Macos,
}

impl Platform {
    pub const fn current() -> Self {
        #[cfg(target_os = "windows")]
        {
            Self::Windows
        }
        #[cfg(not(target_os = "windows"))]
        {
            Self::Macos
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClockFormat {
    #[serde(rename = "12h")]
    TwelveHour,
    #[serde(rename = "24h")]
    TwentyFourHour,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClockSize {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PinVisibility {
    Always,
    Interaction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Background {
    Solid {
        color: String,
    },
    Gradient {
        start: String,
        end: String,
        angle: u16,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmergencyUnlockConfig {
    pub enabled: bool,
    pub shortcut: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicSettings {
    pub clock_format: ClockFormat,
    pub show_seconds: bool,
    pub show_date: bool,
    pub background: Background,
    pub clock_size: ClockSize,
    pub pin_visibility: PinVisibility,
    pub launch_at_login: bool,
    pub cover_after_launch: bool,
    pub idle_minutes: Option<u8>,
    pub compatibility_mode: bool,
    pub emergency_unlock: EmergencyUnlockConfig,
}

impl Default for PublicSettings {
    fn default() -> Self {
        Self {
            clock_format: ClockFormat::TwelveHour,
            show_seconds: false,
            show_date: true,
            background: Background::Gradient {
                start: "#0D1324".into(),
                end: "#124557".into(),
                angle: 90,
            },
            clock_size: ClockSize::Large,
            pin_visibility: PinVisibility::Always,
            launch_at_login: false,
            cover_after_launch: false,
            idle_minutes: None,
            compatibility_mode: true,
            emergency_unlock: EmergencyUnlockConfig {
                enabled: true,
                shortcut: DEFAULT_EMERGENCY_SHORTCUT.into(),
            },
        }
    }
}

impl PublicSettings {
    pub fn validate(&self) -> AppResult<()> {
        match &self.background {
            Background::Solid { color } => validate_color(color)?,
            Background::Gradient { start, end, angle } => {
                validate_color(start)?;
                validate_color(end)?;
                if !matches!(angle, 0 | 45 | 90 | 135) {
                    return Err(AppError::InvalidInput(
                        "Gradient angle must be 0, 45, 90, or 135 degrees.".into(),
                    ));
                }
            }
        }

        if !matches!(self.idle_minutes, None | Some(1 | 5 | 10 | 15 | 30 | 60)) {
            return Err(AppError::InvalidInput(
                "Idle delay must be off, 1, 5, 10, 15, 30, or 60 minutes.".into(),
            ));
        }
        validate_emergency_shortcut(&self.emergency_unlock.shortcut)
    }
}

fn validate_color(color: &str) -> AppResult<()> {
    if color.len() == 7
        && color.starts_with('#')
        && color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "Colors must use six-digit hexadecimal notation (for example, #0D1324).".into(),
        ))
    }
}

pub fn validate_pin(pin: &str) -> AppResult<()> {
    if (4..=12).contains(&pin.len()) && pin.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "PIN must contain 4–12 numbers.".into(),
        ))
    }
}

pub fn validate_emergency_shortcut(shortcut: &str) -> AppResult<()> {
    let Some(key) = shortcut.strip_prefix("Ctrl+Alt+Shift+") else {
        return Err(AppError::InvalidInput(
            "Emergency shortcut must use Ctrl+Alt+Shift plus A–Z or F1–F11.".into(),
        ));
    };

    let letter = key.len() == 1 && key.as_bytes()[0].is_ascii_uppercase();
    let function_key = key
        .strip_prefix('F')
        .and_then(|number| number.parse::<u8>().ok())
        .is_some_and(|number| (1..=11).contains(&number));
    if letter || function_key {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "Emergency shortcut must use Ctrl+Alt+Shift plus A–Z or F1–F11.".into(),
        ))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredConfig {
    pub schema_version: u8,
    pub pin_hash: String,
    pub settings: PublicSettings,
}

impl StoredConfig {
    pub fn new(pin_hash: String, settings: PublicSettings) -> Self {
        Self {
            schema_version: CONFIG_SCHEMA_VERSION,
            pin_hash,
            settings,
        }
    }

    pub fn validate(&self) -> AppResult<()> {
        if self.schema_version != CONFIG_SCHEMA_VERSION {
            return Err(AppError::InvalidInput(format!(
                "Unsupported settings schema version {}.",
                self.schema_version
            )));
        }
        self.settings.validate()?;
        crate::security::validate_hash(&self.pin_hash)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapDto {
    pub version: String,
    pub platform: Platform,
    pub setup_required: bool,
    pub lifecycle: CoverLifecycle,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<PublicSettings>,
    pub autostart_enabled: bool,
    pub idle_supported: bool,
    pub config_status: ConfigStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigWarning {
    pub message: String,
    pub status: ConfigStatus,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_the_product_contract() {
        let settings = PublicSettings::default();
        assert_eq!(settings.clock_format, ClockFormat::TwelveHour);
        assert!(!settings.show_seconds);
        assert!(settings.show_date);
        assert_eq!(settings.clock_size, ClockSize::Large);
        assert_eq!(settings.pin_visibility, PinVisibility::Always);
        assert!(settings.compatibility_mode);
        assert_eq!(
            settings.background,
            Background::Gradient {
                start: "#0D1324".into(),
                end: "#124557".into(),
                angle: 90
            }
        );
        settings.validate().unwrap();
    }

    #[test]
    fn validates_pin_and_shortcut_boundaries() {
        assert!(validate_pin("0000").is_ok());
        assert!(validate_pin("123456789012").is_ok());
        assert!(validate_pin("123").is_err());
        assert!(validate_pin("1234567890123").is_err());
        assert!(validate_pin("12a4").is_err());

        for shortcut in ["Ctrl+Alt+Shift+A", "Ctrl+Alt+Shift+Z", "Ctrl+Alt+Shift+F11"] {
            assert!(validate_emergency_shortcut(shortcut).is_ok());
        }
        for shortcut in ["Ctrl+Shift+U", "Ctrl+Alt+Shift+F12", "Ctrl+Alt+Shift+a"] {
            assert!(validate_emergency_shortcut(shortcut).is_err());
        }
    }
}
