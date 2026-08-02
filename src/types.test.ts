import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, isNumericPin, isValidEmergencyShortcut } from "./types";

describe("PIN validation", () => {
  it("accepts only 4–12 numeric characters and preserves leading zeroes", () => {
    expect(isNumericPin("0123")).toBe(true);
    expect(isNumericPin("123456789012")).toBe(true);
    expect(isNumericPin("123")).toBe(false);
    expect(isNumericPin("1234567890123")).toBe(false);
    expect(isNumericPin("12a4")).toBe(false);
  });
});
describe("settings defaults", () => {
  it("matches the first-run product defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      clockFormat: "12h",
      showSeconds: false,
      showDate: true,
      clockSize: "large",
      pinVisibility: "always",
      launchAtLogin: false,
      coverAfterLaunch: false,
      idleMinutes: null,
      compatibilityMode: true,
      emergencyUnlock: { enabled: false, shortcut: "Ctrl+Alt+Shift+U" },
    });
    expect(DEFAULT_SETTINGS.background).toEqual({
      kind: "gradient",
      start: "#0D1324",
      end: "#124557",
      angle: 90,
    });
  });
});

describe("emergency shortcut validation", () => {
  it("requires Ctrl+Alt+Shift with A–Z or F1–F11", () => {
    expect(isValidEmergencyShortcut("Ctrl+Alt+Shift+U")).toBe(true);
    expect(isValidEmergencyShortcut("Ctrl+Alt+Shift+F11")).toBe(true);
    expect(isValidEmergencyShortcut("Ctrl+Shift+U")).toBe(false);
    expect(isValidEmergencyShortcut("Ctrl+Alt+Shift+F12")).toBe(false);
  });
});
