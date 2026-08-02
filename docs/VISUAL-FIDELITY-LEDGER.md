# Visual fidelity ledger

This ledger ties runtime visual QA to the approved concepts in
`docs/design/approved`. A concept is a design source, not evidence that the
current build behaves correctly. Record comparisons at the same viewport size
where practical and preserve screenshots that contain no private desktop data.

## Status definitions

- **Pass:** Runtime capture matches the approved intent; differences are minor
  platform rendering details.
- **Accepted deviation:** A deliberate difference is recorded with a concrete
  accessibility, platform, or product reason.
- **Fail:** A material mismatch remains.
- **Not assessed:** No representative runtime capture has been compared yet.

## Approved baseline record

| Surface | Approved reference | Required traits | Status | Evidence / deviation |
| --- | --- | --- | --- | --- |
| Cover | [`cover.png`](design/approved/cover.png) | Dark navy-to-teal background, highly legible centered time/date, restrained PIN card, minimal clutter | Accepted deviation | [`primary`](screenshots/cover-primary-macos.png), [`secondary`](screenshots/cover-secondary-macos.png). Layout, contrast, clock hierarchy, and primary-only PIN match. The scalable code-native contour folds replace the concept's raster fabric while preserving its indigo/teal curtain intent. |
| Control | [`control.png`](design/approved/control.png) | Compact utility navigation, unmistakable Uncovered/Covered status, dominant activation action, visible safety warning | Pass | [`control`](screenshots/control-macos.png). Structure, activation hierarchy, status color, warning, controls, and spacing match. Launch-at-login is off because that is the locked product default, despite the concept showing it on. |
| Onboarding | [`onboarding.png`](design/approved/onboarding.png) | Short three-step flow, visual-only explanation, calm hierarchy, clear PIN and startup choices | Pass | [`Welcome`](screenshots/onboarding-macos.png), [`Create PIN`](screenshots/onboarding-pin-macos.png). Startup was exercised through the same runtime bridge; setup finished uncovered even with cover-after-launch selected. |
| Appearance | [`appearance.png`](design/approved/appearance.png) | Live background preview, grouped clock/date controls, clear color and gradient affordances | Pass | [`appearance`](screenshots/appearance-macos.png). Default gradient and exact values match; solid mode, 24-hour time, seconds, clock sizes, and interaction PIN mode were exercised in-browser. |
| Behavior | [`behavior.png`](design/approved/behavior.png) | Startup and idle settings grouped by behavior, unsupported macOS idle state explained | Accepted deviation | [`behavior`](screenshots/behavior-macos.png). The macOS capture intentionally disables idle activation and explains the Windows-only dependency. Locked startup defaults and compatibility-on differ from the illustrative concept state. |
| Security | [`security.png`](design/approved/security.png) | PIN-change flow and emergency bypass disclosure are prominent and unambiguous | Pass | [`security`](screenshots/security-macos.png). Disclosure, disabled default, shortcut, and PIN form match. Browser QA confirmed that enabling and changing the bypass require the current PIN. |

The approved images were copied into the repository at their original supplied
dimensions. No item should be changed to **Pass** based only on a component test
or source inspection.

## Review record template

Add one row per runtime review. Link the capture or CI artifact when it is safe
to retain.

| Date | Commit | Platform / viewport | Surface | Reviewer | Status | Findings and action |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-02 | v0.1.0 release candidate | macOS / 1586×992 | Control and cover | Codex | Pass with accepted cover-art deviation | Compared information hierarchy, clock/PIN alignment, palette, contrast, navigation, activation affordance, icon weight, and spacing. Primary and secondary semantics were also verified through the DOM. |
| 2026-08-02 | v0.1.0 release candidate | macOS / 1586×992 | Onboarding | Codex | Pass | Compared the three-step rail, typography, copy, form widths, focus ring, validation indicators, footer limitation, and button hierarchy. Fixed mismatch-state accessible text during review. |
| 2026-08-02 | v0.1.0 release candidate | macOS / 1586×992 | Appearance, Behavior, Security | Codex | Pass with documented platform deviations | Compared grouped layout, toggle/select geometry, preview, warning treatment, Lucide icon style, and all approved colors. Fixed macOS idle capability reporting during review. |
| 2026-08-02 | v0.1.0 release candidate | macOS / 960×640 minimum-window metrics | Main surfaces | Codex | Pass | In-app-browser layout metrics showed no horizontal overflow at the supported minimum window. CSS reduced-motion rules remove transitions and animations. Retina capture cropping was isolated to the IAB screenshot backend, so retained captures came from the local Playwright fallback against the same server. |

## Release-candidate comparison summary

- **Copy:** Safety language is intentionally more explicit than the concepts in
  Welcome, Control, Security, and About. No required label or disclosure is
  missing.
- **Layout and spacing:** Sidebar proportions, content columns, centered cover
  composition, section rules, and form alignment match the approved hierarchy.
- **Typography:** System sans-serif sizing and weights preserve the concepts'
  restrained utility character; platform glyph rasterization is the only minor
  variation.
- **Palette and artwork:** Navy surfaces, indigo actions, teal status/focus
  accents, and amber emergency warning match. Folded-curtain imagery is rendered
  with bundled CSS/SVG contours so it scales without runtime image or network
  dependencies.
- **Controls and icons:** Lucide-style strokes, custom brand mark, toggles,
  segmented controls, radios, selects, and focus treatment are consistent across
  all surfaces.
- **Behavior and accessibility:** Wrong PIN clears and refocuses, its alert lasts
  1.5 seconds, Escape is consumed, secondary covers omit the PIN, reset requires
  exact `RESET`, and emergency changes require the current PIN. The browser pass
  ended with zero console errors and zero warnings.

No material visual drift remains for the 0.1.0 release candidate. Real Windows
multi-monitor, DPI, shell, and secure-desktop behavior remains explicitly gated
by the Windows 11 hardware checklist.

For each review, compare copy, information hierarchy, typography, palette,
icons, spacing, alignment, responsive behavior, focus treatment, error states,
and reduced-motion behavior. A release-blocking mismatch must be fixed or
documented as an accepted deviation before publication.
