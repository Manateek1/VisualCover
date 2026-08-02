# Release checklist

Use this checklist for `v0.1.0`. Do not push the tag until the ordinary Windows
workflow is green for the exact commit being released.

## Prepare the commit

- [ ] The default branch is `main` and the public repository is
  `Manateek1/visual-cover`.
- [ ] `package.json`, `src-tauri/Cargo.toml`, and
  `src-tauri/tauri.conf.json` all contain version `0.1.0`.
- [ ] `.nvmrc` is `24.18.1`, `rust-toolchain.toml` is `1.97.1`, and both npm and
  Cargo lockfiles are committed.
- [ ] `npm ci` and `npm run check` pass from a clean dependency install.
- [ ] Rust formatting, Clippy with warnings denied, and all Cargo tests pass.
- [ ] `npm run tauri -- dev` completes the macOS onboarding, activate-cover,
  wrong-PIN, correct-PIN, tray, relaunch, and persistence smoke checks.
- [ ] `npm run tauri -- build --bundles app` succeeds on macOS.
- [ ] Runtime screenshots have been compared with every approved concept and
  the visual fidelity ledger contains the result.
- [ ] README, security limitations, installation steps, and Windows checklist
  match the shipped behavior.

## Validate Windows CI

- [ ] Push the release commit to `main` and wait for the **Windows** workflow.
- [ ] All frontend and Rust quality gates are green.
- [ ] The NSIS step produces exactly
  `VisualCover_0.1.0_x64-setup.exe`.
- [ ] The run uploads
  `VisualCover-0.1.0-windows-x64-installer`; download and inspect its ZIP.
- [ ] Record the installer SHA-256. If real Windows hardware testing is
  available, complete the Windows 11 checklist against this exact file.
- [ ] Any uncompleted hardware checks are stated as unverified rather than
  silently treated as passing.

## Publish and verify

- [ ] Create annotated tag `v0.1.0` on the already-green commit and push it.
- [ ] Wait for the **Release** workflow; do not manually create a competing
  draft release.
- [ ] The workflow repeats the frontend and Rust gates and completes without a
  skipped publishing step.
- [ ] The GitHub Release is public, non-draft, not marked as a prerelease, and
  is titled `VisualCover v0.1.0`.
- [ ] The release includes the x64 NSIS `.exe`, the unsigned/SmartScreen
  warning, the visual-only security boundary, and the real-hardware test status.
- [ ] Download the public asset in a signed-out browser and verify its filename
  and SHA-256 against the tested artifact.
- [ ] Install and uninstall the public asset on Windows 11, or state explicitly
  in the release notes that this final public-asset check remains unverified.
