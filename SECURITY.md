# Security policy

## Supported version

VisualCover is pre-1.0 software. Security fixes are applied to the latest
published 0.1.x release and the `main` branch.

## Reporting a vulnerability

Please use GitHub's private
[security-advisory form](https://github.com/Manateek1/visual-cover/security/advisories/new).
Do not open a public issue for a vulnerability that could expose a user's PIN
hash, bypass an authenticated in-app action unexpectedly, or enable unintended
code execution.

Include the VisualCover version, Windows or macOS version, reproduction steps,
expected result, actual result, and the minimum evidence needed to demonstrate
the issue. Remove PINs, credentials, app-data files, WhatsApp content, and other
personal information.

## Security boundary

VisualCover is not an operating-system lock and does not claim to protect an
unattended Windows account against a determined local user. Task Manager,
secure-desktop transitions, Ctrl+Alt+Delete, UAC, user switching, accessibility
or system shortcuts, elevated software, rebooting, process termination,
application crashes, coordinate-based automation, and access to the current
user's files can bypass or expose the visual curtain.

A report that only demonstrates one of those documented limitations may be
closed as expected behavior. Reports about unexpected PIN disclosure, unsafe
configuration persistence, unauthenticated removal through VisualCover's own
controls, or code-execution risks remain valuable.
