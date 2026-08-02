# Windows 11 test checklist

Complete this checklist on real Windows 11 hardware before describing a release
as Windows-verified. Keep screenshots and logs free of PINs, private messages,
tokens, usernames, and unrelated desktop content.

## Test record

| Field | Value |
| --- | --- |
| VisualCover version and commit | |
| Installer filename | `VisualCover_0.1.0_x64-setup.exe` |
| Installer SHA-256 | |
| Windows edition, version, and build | |
| CPU architecture | x64 |
| GPU and driver | |
| Monitor count and layout | |
| Monitor resolutions, scaling, and primary display | |
| Tester and date | |

Use **Pass**, **Fail**, **Blocked**, or **Not applicable** for each result and
attach concise evidence for failures.

## Installation and first launch

- [ ] **Result:** The installer starts on a clean current-user account.
- [ ] **Result:** The unsigned SmartScreen path and publisher status match the
  release documentation; no signed-build claim is shown.
- [ ] **Result:** WebView2 is installed or acquired successfully when absent.
- [ ] **Result:** VisualCover appears in the Start menu and Installed apps.
- [ ] **Result:** Welcome explains that this is a visual cover, not Windows
  authentication, and that background applications continue.
- [ ] **Result:** PIN creation rejects non-digits, fewer than 4 digits, more
  than 12 digits, and a mismatched confirmation.
- [ ] **Result:** A valid PIN, including one with leading zeroes, completes
  setup and opens the main window uncovered.
- [ ] **Result:** Restarting VisualCover loads the saved settings without
  repeating onboarding.
- [ ] **Result:** `%APPDATA%\com.dillonnagar.visualcover` contains no raw PIN.

Evidence and notes:

## Basic cover and authentication

- [ ] **Result:** Activate Cover changes the authoritative state from
  Uncovered to Covered and creates exactly one cover window per monitor.
- [ ] **Result:** The primary monitor alone shows the PIN interface.
- [ ] **Result:** Time, optional seconds, date visibility, clock size, solid
  background, and every gradient angle reflect saved settings.
- [ ] **Result:** A wrong PIN clears the input, restores focus, and announces a
  subtle accessible error for about 1.5 seconds.
- [ ] **Result:** The correct PIN removes every cover together and reveals the
  desktop immediately without opening the settings window.
- [ ] **Result:** Show-on-interaction preserves the first numeric key, reveals
  the PIN interface, and hides it after eight empty seconds.
- [ ] **Result:** Escape does not close or uncover the app.
- [ ] **Result:** Alt+F4 does not close or uncover the cover window.
- [ ] **Result:** Win+D and Win+M do not leave the desktop exposed; record any
  transient exposure and confirm the watchdog restores coverage.
- [ ] **Result:** Ordinary window controls are absent and the taskbar is
  visually covered on every monitor.
- [ ] **Result:** Alt+Tab does not present an ordinary removable cover-window
  entry. Record OS-version differences rather than treating this as security.
- [ ] **Result:** Ctrl+Alt+Delete can reach the Windows secure desktop as
  documented; returning does not crash VisualCover.

Evidence and notes:

## Monitor layouts and recovery

Run the whole section once with compatibility mode enabled and once disabled.

- [ ] **Result:** One 100%-scale monitor is fully covered at its physical
  bounds.
- [ ] **Result:** Three monitors are covered simultaneously.
- [ ] **Result:** A mixed-DPI layout (for example 100%, 125%, and 150%) has no
  uncovered strips or incorrect scaling.
- [ ] **Result:** A monitor positioned left of or above the primary (negative
  virtual-desktop coordinates) is placed correctly.
- [ ] **Result:** Only the Windows-designated primary monitor accepts the PIN.
- [ ] **Result:** Disconnecting a secondary while covered removes or replaces
  the stale window without uncovering remaining monitors.
- [ ] **Result:** Connecting a monitor while covered adds a synchronized cover
  without requiring a new app process.
- [ ] **Result:** Changing the primary display while covered reconciles the
  generation and leaves one PIN interface.
- [ ] **Result:** Attempting to minimize, hide, move, resize, or close one cover
  causes it to be restored without focus pumping in compatibility mode.
- [ ] **Result:** A failed replacement generation leaves the prior complete
  generation visible instead of exposing only part of the desktop.

Evidence and notes:

## Tray, second launch, and recovery paths

- [ ] **Result:** While uncovered, Activate Cover, Open Settings, About, and
  Quit perform their named actions.
- [ ] **Result:** Closing the main window hides it to the tray rather than
  terminating the app.
- [ ] **Result:** While covered, Open Settings requests the PIN and opens
  settings only after successful authentication.
- [ ] **Result:** While covered, Quit requests the PIN and terminates only after
  successful authentication.
- [ ] **Result:** A failed PIN leaves the cover and pending tray action intact.
- [ ] **Result:** About can open above the cover without removing it.
- [ ] **Result:** Starting VisualCover a second time while uncovered focuses the
  existing instance and does not create another tray icon or process session.
- [ ] **Result:** Starting it a second time while covered keeps coverage active,
  repairs missing cover windows, and does not steal focus repeatedly.
- [ ] **Result:** If the primary settings file is corrupt, a valid backup is
  restored and a warning is shown.
- [ ] **Result:** If primary and backup are corrupt, automatic covering is
  disabled and the Retry/Reset screen requires the exact word `RESET`.

Evidence and notes:

## Startup, idle, and emergency unlock

- [ ] **Result:** Launch at login creates only a per-user interactive-session
  startup entry and does not create a Windows service.
- [ ] **Result:** Autostart without cover-after-launch starts quietly in the
  tray.
- [ ] **Result:** Autostart with cover-after-launch covers only after completed
  onboarding.
- [ ] **Result:** Disabling launch at login removes the startup entry.
- [ ] **Result:** Each supported idle threshold activates no earlier than the
  selected real system-idle duration; normal user input resets the timer.
- [ ] **Result:** Idle detection does not sleep, lock, or switch the Windows
  session.
- [ ] **Result:** Emergency unlock is disabled by default.
- [ ] **Result:** Enabling or changing it requires the current PIN and rejects
  shortcuts outside Ctrl+Alt+Shift plus A–Z or F1–F11.
- [ ] **Result:** The configured shortcut is active only while covered.
- [ ] **Result:** Emergency unlock removes the cover, clears pending tray
  actions, and never quits VisualCover.

Evidence and notes:

## Background workload and GoodMorningBot

- [ ] **Result:** A long file transfer continues at a comparable rate while
  covered.
- [ ] **Result:** Plex remains reachable and can continue a stream while
  covered.
- [ ] **Result:** Python, Chrome, Fooocus, Playwright, qBittorrent, and relevant
  scheduled tasks are not terminated, suspended, or deliberately minimized.
- [ ] **Result:** The full GoodMorningBot procedure in the README produces a new
  image and success logs while the cover remains active.
- [ ] **Result:** A second device receives the new WhatsApp test image with a
  timestamp inside the covered interval.
- [ ] **Result:** DOM/CDP browser automation works in compatibility mode, or any
  limitation is recorded precisely.
- [ ] **Result:** Coordinate-based foreground automation is recorded as
  unsupported and is not used as the release acceptance test.

Evidence and notes:

## Uninstall and release decision

- [ ] **Result:** After Launch at login is disabled, Installed apps uninstalls
  the executable and no broken per-user startup entry remains.
- [ ] **Result:** Any retained app-data configuration is documented and can be
  removed manually after uninstall.
- [ ] **Result:** The GitHub Release asset name and checksum match the tested
  installer.
- [ ] **Result:** All failures have linked issues or release-note limitations.
- [ ] **Decision:** The release is approved for Windows 11, or release notes
  explicitly state that real-machine verification remains incomplete.

Final notes:
