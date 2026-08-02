use argon2::{
    Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version,
    password_hash::SaltString,
};
use rand_core::{OsRng, RngCore};

use crate::{
    error::{AppError, AppResult},
    model::validate_pin,
};

const MEMORY_COST_KIB: u32 = 64 * 1024;
const TIME_COST: u32 = 3;
const LANES: u32 = 1;
const SALT_LENGTH: usize = 16;

fn configured_argon2() -> AppResult<Argon2<'static>> {
    let params = Params::new(MEMORY_COST_KIB, TIME_COST, LANES, None)
        .map_err(|error| AppError::Native(error.to_string()))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

pub fn hash_pin(pin: &str) -> AppResult<String> {
    validate_pin(pin)?;
    let mut salt_bytes = [0_u8; SALT_LENGTH];
    OsRng.fill_bytes(&mut salt_bytes);
    let salt =
        SaltString::encode_b64(&salt_bytes).map_err(|error| AppError::Native(error.to_string()))?;
    configured_argon2()?
        .hash_password(pin.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| AppError::Native(error.to_string()))
}

pub fn verify_pin(pin_hash: &str, candidate: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(pin_hash) else {
        return false;
    };
    configured_argon2()
        .and_then(|argon2| {
            argon2
                .verify_password(candidate.as_bytes(), &parsed)
                .map_err(|error| AppError::Native(error.to_string()))
        })
        .is_ok()
}

pub fn validate_hash(pin_hash: &str) -> AppResult<()> {
    let parsed = PasswordHash::new(pin_hash)
        .map_err(|_| AppError::InvalidInput("Saved PIN hash is invalid.".into()))?;
    if parsed.algorithm.as_str() != "argon2id"
        || parsed.version != Some(19)
        || parsed.params.get_decimal("m") != Some(MEMORY_COST_KIB)
        || parsed.params.get_decimal("t") != Some(TIME_COST)
        || parsed.params.get_decimal("p") != Some(LANES)
        || parsed.params.iter().count() != 3
    {
        return Err(AppError::InvalidInput(
            "Saved PIN hash uses unsupported parameters.".into(),
        ));
    }

    let salt = parsed
        .salt
        .ok_or_else(|| AppError::InvalidInput("Saved PIN hash has no salt.".into()))?;
    let mut decoded = [0_u8; 64];
    let decoded = salt
        .decode_b64(&mut decoded)
        .map_err(|_| AppError::InvalidInput("Saved PIN hash salt is invalid.".into()))?;
    if decoded.len() != SALT_LENGTH {
        return Err(AppError::InvalidInput(
            "Saved PIN hash salt has the wrong length.".into(),
        ));
    }
    if parsed.hash.as_ref().map(|hash| hash.as_bytes().len()) != Some(32) {
        return Err(AppError::InvalidInput(
            "Saved PIN hash digest is missing or has the wrong length.".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_with_required_argon2id_parameters_and_unique_salts() {
        let first = hash_pin("0042").unwrap();
        let second = hash_pin("0042").unwrap();
        assert_ne!(first, second);
        assert!(first.starts_with("$argon2id$v=19$m=65536,t=3,p=1$"));
        assert!(validate_hash(&first).is_ok());
        assert!(verify_pin(&first, "0042"));
        assert!(!verify_pin(&first, "42"));
    }

    #[test]
    fn rejects_noncompliant_or_malformed_hashes() {
        assert!(validate_hash("not-a-hash").is_err());
        assert!(validate_hash("$argon2id$v=19$m=65536,t=3,p=1$BwcHBwcHBwcHBwcHBwcHBw").is_err());
        assert!(validate_hash("$argon2id$v=19$m=65536,t=3,p=1$BwcHBwcHBwcHBwcHBwcHBw$Bw").is_err());
        let weak = Argon2::default()
            .hash_password(b"1234", &SaltString::encode_b64(&[7_u8; 16]).unwrap())
            .unwrap()
            .to_string();
        assert!(validate_hash(&weak).is_err());
    }
}
