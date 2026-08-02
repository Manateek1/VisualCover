# Contributing to VisualCover

Thanks for helping improve VisualCover. Changes should preserve its narrow
promise: it is a visual privacy cover that leaves the signed-in desktop and
background programs running. Do not describe it as a secure lock screen.

## Before opening an issue

- Use the bug form for reproducible failures and the feature form for product
  proposals.
- Search existing issues first.
- Do not post PINs, app-data files, WhatsApp content, authentication material,
  or other private data.
- Report security-sensitive behavior privately as described in
  [SECURITY.md](SECURITY.md).

## Development setup

The repository pins Node.js `24.18.1` and Rust `1.97.1`. On macOS, install Xcode
Command Line Tools first. Then run:

```sh
nvm install
nvm use
npm ci
npm run tauri -- dev
```

Keep `package-lock.json` and `Cargo.lock` committed. Do not add network services,
analytics, accounts, telemetry, a master PIN, or system-wide input hooks.

## Required checks

Run these before opening a pull request:

```sh
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

Changes to Windows cover behavior, monitor placement, tray authentication,
autostart, idle detection, or emergency unlock also need relevant evidence from
the [Windows 11 checklist](docs/WINDOWS-11-TEST-CHECKLIST.md). macOS behavior is
useful development evidence but must not be presented as Windows verification.

## Pull requests

Keep changes focused and explain:

- the user-visible problem and result;
- security or privacy implications;
- tests run and platforms tested;
- any Windows checklist evidence;
- visual differences, with screenshots and an updated
  [fidelity ledger](docs/VISUAL-FIDELITY-LEDGER.md) when applicable.

Do not commit generated build output, secrets, personal test data, or real
GoodMorningBot/WhatsApp content. By contributing, you agree that your changes
are licensed under the repository's [MIT License](LICENSE).
