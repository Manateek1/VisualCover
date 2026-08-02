import { vi } from "vitest";
import type { NativeClient } from "../lib/native";
import { DEFAULT_SETTINGS, type BootstrapDto } from "../types";

export function makeBootstrap(change: Partial<BootstrapDto> = {}): BootstrapDto {
  return {
    version: "0.1.0",
    platform: "windows",
    setupRequired: false,
    lifecycle: "uncovered",
    settings: structuredClone(DEFAULT_SETTINGS),
    autostartEnabled: false,
    idleSupported: true,
    configStatus: "ok",
    ...change,
  };
}
export function makeNativeClient(bootstrap = makeBootstrap()): NativeClient {
  return {
    isNative: false,
    getBootstrap: vi.fn(async () => structuredClone(bootstrap)),
    completeSetup: vi.fn(async () => undefined),
    updatePreferences: vi.fn(async () => undefined),
    changePin: vi.fn(async () => undefined),
    configureEmergencyUnlock: vi.fn(async () => undefined),
    activateCover: vi.fn(async () => undefined),
    coverWindowReady: vi.fn(async () => undefined),
    unlock: vi.fn(async () => false),
    requestQuit: vi.fn(async () => undefined),
    resetCorruptConfiguration: vi.fn(async () => undefined),
    on: vi.fn(async () => () => undefined),
    minimizeWindow: vi.fn(async () => undefined),
    toggleMaximizeWindow: vi.fn(async () => undefined),
    closeWindow: vi.fn(async () => undefined),
  };
}
