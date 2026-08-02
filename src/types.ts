export type CoverLifecycle = "uncovered" | "covering" | "covered" | "uncovering";

export type IdleMinutes = null | 1 | 5 | 10 | 15 | 30 | 60;

export type Background =
  | { kind: "solid"; color: string }
  | {
      kind: "gradient";
      start: string;
      end: string;
      angle: 0 | 45 | 90 | 135;
    };

export type EmergencyUnlockConfig = {
  enabled: boolean;
  shortcut: string;
};

export type PublicSettings = {
  clockFormat: "12h" | "24h";
  showSeconds: boolean;
  showDate: boolean;
  background: Background;
  clockSize: "small" | "medium" | "large";
  pinVisibility: "always" | "interaction";
  launchAtLogin: boolean;
  coverAfterLaunch: boolean;
  idleMinutes: IdleMinutes;
  compatibilityMode: boolean;
  emergencyUnlock: EmergencyUnlockConfig;
};

export type BootstrapDto = {
  version: string;
  platform: "windows" | "macos";
  setupRequired: boolean;
  lifecycle: CoverLifecycle;
  settings?: PublicSettings;
  autostartEnabled: boolean;
  idleSupported: boolean;
  configStatus: "ok" | "recovered-from-backup" | "corrupt";
};

export type ConfigWarning = {
  message: string;
  status: BootstrapDto["configStatus"];
};

export type CoverWindowContext = {
  isCover: boolean;
  primary: boolean;
  sessionId: string;
  index: number;
};

export const DEFAULT_SETTINGS: PublicSettings = {
  clockFormat: "12h",
  showSeconds: false,
  showDate: true,
  background: {
    kind: "gradient",
    start: "#0D1324",
    end: "#124557",
    angle: 90,
  },
  clockSize: "large",
  pinVisibility: "always",
  launchAtLogin: false,
  coverAfterLaunch: false,
  idleMinutes: null,
  compatibilityMode: true,
  emergencyUnlock: {
    enabled: true,
    shortcut: "Ctrl+Alt+Shift+U",
  },
};

export function isNumericPin(pin: string): boolean {
  return /^\d{4,12}$/.test(pin);
}
export function isValidEmergencyShortcut(shortcut: string): boolean {
  return /^Ctrl\+Alt\+Shift\+(?:[A-Z]|F(?:[1-9]|1[01]))$/.test(shortcut);
}
