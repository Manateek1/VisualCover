use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::fs::File;

use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    model::{ConfigStatus, StoredConfig},
};

const SETTINGS_FILE: &str = "settings-v1.json";
const BACKUP_FILE: &str = "settings-v1.json.bak";

#[derive(Debug, Clone)]
pub struct ConfigStore {
    root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoadOutcome {
    Missing,
    Loaded {
        config: StoredConfig,
        status: ConfigStatus,
    },
    Corrupt,
}

impl ConfigStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn primary_path(&self) -> PathBuf {
        self.root.join(SETTINGS_FILE)
    }

    pub fn backup_path(&self) -> PathBuf {
        self.root.join(BACKUP_FILE)
    }

    pub fn load(&self) -> LoadOutcome {
        let primary = self.primary_path();
        let backup = self.backup_path();
        match read_valid_config(&primary) {
            Ok(config) => LoadOutcome::Loaded {
                config,
                status: ConfigStatus::Ok,
            },
            Err(primary_error) => match read_valid_config(&backup) {
                Ok(config) => {
                    // Recovery remains usable even if this best-effort repair cannot be written.
                    let _ = self.replace_primary_without_rotation(&config);
                    LoadOutcome::Loaded {
                        config,
                        status: ConfigStatus::RecoveredFromBackup,
                    }
                }
                Err(backup_error)
                    if primary_error.kind() == io::ErrorKind::NotFound
                        && backup_error.kind() == io::ErrorKind::NotFound =>
                {
                    LoadOutcome::Missing
                }
                Err(_) => LoadOutcome::Corrupt,
            },
        }
    }

    pub fn save(&self, config: &StoredConfig) -> AppResult<()> {
        config.validate()?;
        fs::create_dir_all(&self.root).map_err(|error| AppError::Persistence(error.to_string()))?;
        let bytes = serialized_config(config)?;
        let temporary = self.temporary_path();
        write_synced_new_file(&temporary, &bytes)
            .map_err(|error| AppError::Persistence(error.to_string()))?;

        let result = self.rotate_and_replace(&temporary);
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result.map_err(|error| AppError::Persistence(error.to_string()))
    }

    pub fn reset(&self) -> AppResult<()> {
        remove_if_present(&self.primary_path())
            .and_then(|()| remove_if_present(&self.backup_path()))
            .map_err(|error| AppError::Persistence(error.to_string()))
    }

    fn rotate_and_replace(&self, temporary: &Path) -> io::Result<()> {
        let primary = self.primary_path();
        let backup = self.backup_path();

        if read_valid_config(&primary).is_ok() {
            remove_if_present(&backup)?;
            fs::rename(&primary, &backup)?;
        } else {
            remove_if_present(&primary)?;
        }

        fs::rename(temporary, &primary)?;
        sync_directory(&self.root);
        Ok(())
    }

    fn replace_primary_without_rotation(&self, config: &StoredConfig) -> AppResult<()> {
        fs::create_dir_all(&self.root).map_err(|error| AppError::Persistence(error.to_string()))?;
        let temporary = self.temporary_path();
        let bytes = serialized_config(config)?;
        write_synced_new_file(&temporary, &bytes)
            .map_err(|error| AppError::Persistence(error.to_string()))?;
        let result = remove_if_present(&self.primary_path())
            .and_then(|()| fs::rename(&temporary, self.primary_path()));
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result.map_err(|error| AppError::Persistence(error.to_string()))?;
        sync_directory(&self.root);
        Ok(())
    }

    fn temporary_path(&self) -> PathBuf {
        self.root
            .join(format!("{SETTINGS_FILE}.{}.tmp", Uuid::new_v4()))
    }
}

fn serialized_config(config: &StoredConfig) -> AppResult<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(config)
        .map_err(|error| AppError::Persistence(error.to_string()))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn read_valid_config(path: &Path) -> io::Result<StoredConfig> {
    let bytes = fs::read(path)?;
    let config: StoredConfig = serde_json::from_slice(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    config
        .validate()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?;
    Ok(config)
}

fn write_synced_new_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.flush()?;
    file.sync_all()
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(unix)]
fn sync_directory(path: &Path) {
    if let Ok(directory) = File::open(path) {
        let _ = directory.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        model::PublicSettings,
        security::{hash_pin, verify_pin},
    };

    fn sample_config(pin: &str) -> StoredConfig {
        StoredConfig::new(hash_pin(pin).unwrap(), PublicSettings::default())
    }

    #[test]
    fn saves_and_round_trips_the_versioned_schema_without_raw_pin() {
        let directory = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(directory.path().to_owned());
        let config = sample_config("0019");
        store.save(&config).unwrap();

        assert_eq!(
            store.load(),
            LoadOutcome::Loaded {
                config: config.clone(),
                status: ConfigStatus::Ok
            }
        );
        let bytes = fs::read(store.primary_path()).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("0019"));
        assert!(String::from_utf8_lossy(&bytes).contains("$argon2id$"));
    }

    #[test]
    fn rotates_valid_primary_and_recovers_from_backup() {
        let directory = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(directory.path().to_owned());
        let first = sample_config("1111");
        let second = sample_config("2222");
        store.save(&first).unwrap();
        store.save(&second).unwrap();
        fs::write(store.primary_path(), b"{broken json").unwrap();

        assert_eq!(
            store.load(),
            LoadOutcome::Loaded {
                config: first,
                status: ConfigStatus::RecoveredFromBackup
            }
        );
    }

    #[test]
    fn reports_corrupt_when_primary_and_backup_are_invalid() {
        let directory = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(directory.path().to_owned());
        fs::write(store.primary_path(), b"bad").unwrap();
        fs::write(store.backup_path(), b"also bad").unwrap();
        assert_eq!(store.load(), LoadOutcome::Corrupt);
    }

    #[test]
    fn failed_atomic_write_does_not_create_a_partial_primary() {
        let directory = tempfile::tempdir().unwrap();
        let root_that_is_a_file = directory.path().join("not-a-directory");
        fs::write(&root_that_is_a_file, b"occupied").unwrap();
        let store = ConfigStore::new(root_that_is_a_file);
        assert!(store.save(&sample_config("2468")).is_err());
        assert!(!store.primary_path().exists());
    }

    #[test]
    fn pin_change_replaces_the_hash_without_changing_preferences() {
        let directory = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(directory.path().to_owned());
        let mut config = sample_config("1357");
        let expected_settings = config.settings.clone();
        store.save(&config).unwrap();

        config.pin_hash = hash_pin("2468").unwrap();
        store.save(&config).unwrap();
        let LoadOutcome::Loaded { config, .. } = store.load() else {
            panic!("updated configuration should load");
        };
        assert!(!verify_pin(&config.pin_hash, "1357"));
        assert!(verify_pin(&config.pin_hash, "2468"));
        assert_eq!(config.settings, expected_settings);
    }
}
