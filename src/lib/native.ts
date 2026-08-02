import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DEFAULT_SETTINGS,
  type BootstrapDto,
  type ConfigWarning,
  type CoverLifecycle,
  type CoverWindowContext,
  type EmergencyUnlockConfig,
  type PublicSettings,
} from "../types";

type EventMap = {
  "visualcover://state": CoverLifecycle | { lifecycle: CoverLifecycle };
  "visualcover://settings": PublicSettings;
  "visualcover://reveal-pin": undefined;
  "visualcover://config-warning": ConfigWarning | string;
  "visualcover://open-about": undefined;
};

export type NativeClient = {
  isNative: boolean;
  getBootstrap: () => Promise<BootstrapDto>;
  completeSetup: (pin: string, settings: PublicSettings) => Promise<void>;
  updatePreferences: (settings: PublicSettings) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  configureEmergencyUnlock: (
    currentPin: string,
    config: EmergencyUnlockConfig,
  ) => Promise<void>;
  activateCover: () => Promise<void>;
  coverWindowReady: (sessionId: string) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  requestQuit: () => Promise<void>;
  resetCorruptConfiguration: (confirmation: string) => Promise<void>;
  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void,
  ): Promise<UnlistenFn>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const inTauri = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

const tauriClient: NativeClient = {
  isNative: true,
  getBootstrap: () => invoke<BootstrapDto>("get_bootstrap"),
  completeSetup: (pin, settings) => invoke("complete_setup", { pin, settings }),
  updatePreferences: (settings) => invoke("update_preferences", { settings }),
  changePin: (currentPin, newPin) =>
    invoke("change_pin", { currentPin, newPin }),
  configureEmergencyUnlock: (currentPin, config) =>
    invoke("configure_emergency_unlock", { currentPin, config }),
  activateCover: () => invoke("activate_cover"),
  coverWindowReady: (sessionId) => invoke("cover_window_ready", { sessionId }),
  unlock: (pin) => invoke<boolean>("unlock", { pin }),
  requestQuit: () => invoke("request_quit"),
  resetCorruptConfiguration: (confirmation) =>
    invoke("reset_corrupt_configuration", { confirmation }),
  on: async (event, handler) =>
    listen(event, ({ payload }) => handler(payload as EventMap[typeof event])),
  minimizeWindow: () => getCurrentWindow().minimize(),
  toggleMaximizeWindow: () => getCurrentWindow().toggleMaximize(),
  closeWindow: () => getCurrentWindow().close(),
};

type PreviewState = {
  pin: string;
  bootstrap: BootstrapDto;
  listeners: Map<keyof EventMap, Set<(payload: unknown) => void>>;
};

function previewMode(): string | null {
  return new URLSearchParams(window.location.search).get("preview");
}

function makePreviewState(): PreviewState {
  const mode = previewMode();
  const isWindows = navigator.userAgent.includes("Windows");
  return {
    pin: "1234",
    bootstrap: {
      version: "0.1.0",
      platform: isWindows ? "windows" : "macos",
      setupRequired: mode === "onboarding",
      lifecycle: mode === "cover" ? "covered" : "uncovered",
      settings: { ...DEFAULT_SETTINGS },
      autostartEnabled: false,
      idleSupported: isWindows,
      configStatus: mode === "corrupt" ? "corrupt" : "ok",
    },
    listeners: new Map(),
  };
}

let previewState: PreviewState | undefined;

function getPreviewState(): PreviewState {
  previewState ??= makePreviewState();
  return previewState;
}

function previewDispatch<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
  getPreviewState().listeners.get(event)?.forEach((handler) => handler(payload));
}

const previewClient: NativeClient = {
  isNative: false,
  getBootstrap: async () => structuredClone(getPreviewState().bootstrap),
  completeSetup: async (pin, settings) => {
    const state = getPreviewState();
    state.pin = pin;
    state.bootstrap = {
      ...state.bootstrap,
      setupRequired: false,
      lifecycle: "uncovered",
      settings: structuredClone(settings),
      autostartEnabled: settings.launchAtLogin,
      configStatus: "ok",
    };
  },
  updatePreferences: async (settings) => {
    const state = getPreviewState();
    state.bootstrap.settings = structuredClone(settings);
    state.bootstrap.autostartEnabled = settings.launchAtLogin;
    previewDispatch("visualcover://settings", structuredClone(settings));
  },
  changePin: async (currentPin, newPin) => {
    const state = getPreviewState();
    if (currentPin !== state.pin) throw new Error("Current PIN is incorrect.");
    state.pin = newPin;
  },
  configureEmergencyUnlock: async (currentPin, config) => {
    const state = getPreviewState();
    if (currentPin !== state.pin) throw new Error("Current PIN is incorrect.");
    if (!state.bootstrap.settings) throw new Error("Setup is incomplete.");
    state.bootstrap.settings.emergencyUnlock = structuredClone(config);
    previewDispatch(
      "visualcover://settings",
      structuredClone(state.bootstrap.settings),
    );
  },
  activateCover: async () => {
    const state = getPreviewState();
    state.bootstrap.lifecycle = "covered";
    previewDispatch("visualcover://state", "covered");
  },
  coverWindowReady: async (sessionId) => {
    if (sessionId) await Promise.resolve();
  },
  unlock: async (pin) => {
    const state = getPreviewState();
    const valid = pin === state.pin;
    if (valid) {
      state.bootstrap.lifecycle = "uncovered";
      previewDispatch("visualcover://state", "uncovered");
    }
    return valid;
  },
  requestQuit: async () => undefined,
  resetCorruptConfiguration: async (confirmation) => {
    if (confirmation !== "RESET") throw new Error("Type RESET to confirm.");
    previewState = makePreviewState();
    getPreviewState().bootstrap.configStatus = "ok";
    getPreviewState().bootstrap.setupRequired = true;
    getPreviewState().bootstrap.settings = undefined;
  },
  on: async (event, handler) => {
    const listeners = getPreviewState().listeners;
    const genericHandler = handler as (payload: unknown) => void;
    const set = listeners.get(event) ?? new Set<(payload: unknown) => void>();
    set.add(genericHandler);
    listeners.set(event, set);
    return () => {
      set.delete(genericHandler);
    };
  },
  minimizeWindow: async () => undefined,
  toggleMaximizeWindow: async () => undefined,
  closeWindow: async () => undefined,
};

let testClient: NativeClient | undefined;

export function setNativeClientForTests(client?: NativeClient) {
  testClient = client;
}

export function resetPreviewForTests() {
  previewState = undefined;
}

export function getNativeClient(): NativeClient {
  return testClient ?? (inTauri() ? tauriClient : previewClient);
}

export function getCoverWindowContext(): CoverWindowContext {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  const surface = params.get("surface");
  const preview = params.get("preview");
  const primaryParam = params.get("primary");
  const isCover =
    preview === "cover" || surface === "cover" || role === "primary" || role === "secondary" || role === "cover";
  const primary =
    role === "primary" ||
    (role !== "secondary" && primaryParam !== "false" && primaryParam !== "0");

  return {
    isCover,
    primary,
    sessionId: params.get("session") ?? params.get("sessionId") ?? "preview",
    index: Number.parseInt(params.get("index") ?? "0", 10) || 0,
  };
}
