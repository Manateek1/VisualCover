## Result

Describe the user-visible problem and outcome.

## Verification

- [ ] `npm run check`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --all-features`
- [ ] Relevant Windows 11 checklist items, or not applicable with an explanation

Platforms and scenarios tested:

## Safety and privacy

- [ ] The change preserves the visual-only product boundary.
- [ ] No PIN, credential, private message, personal screenshot, or generated build output is included.
- [ ] Security, tray-authentication, startup, emergency-unlock, and background-automation effects are described.
- [ ] Visual changes include sanitized captures and an updated fidelity ledger.
