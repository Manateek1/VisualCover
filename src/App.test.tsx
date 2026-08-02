import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { setNativeClientForTests } from "./lib/native";
import { makeBootstrap, makeNativeClient } from "./test/nativeMock";
import { DEFAULT_SETTINGS } from "./types";

describe("VisualCover app", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    setNativeClientForTests(undefined);
  });

  it("completes first launch with validated numeric PINs", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient(makeBootstrap({ setupRequired: true, settings: undefined }));
    setNativeClientForTests(native);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Welcome to VisualCover" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Get started" }));

    const pin = screen.getByLabelText("PIN");
    const confirmation = screen.getByLabelText("Confirm PIN");
    const continueButton = screen.getByRole("button", { name: "Continue" });
    await user.type(pin, "123");
    await user.type(confirmation, "123");
    expect(continueButton).toBeDisabled();

    await user.clear(pin);
    await user.clear(confirmation);
    await user.type(pin, "0123");
    await user.type(confirmation, "0123");
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(screen.getByRole("heading", { name: "Choose startup behavior" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Launch at login" }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(native.completeSetup).toHaveBeenCalledWith(
      "0123",
      expect.objectContaining({ launchAtLogin: true, coverAfterLaunch: false }),
    ));
    expect(await screen.findByText("Desktop is uncovered")).toBeInTheDocument();
  });

  it("clears both PIN fields and returns to PIN creation when setup fails", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient(makeBootstrap({ setupRequired: true, settings: undefined }));
    vi.mocked(native.completeSetup).mockRejectedValueOnce(new Error("Setup could not be saved."));
    setNativeClientForTests(native);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Get started" }));
    await user.type(screen.getByLabelText("PIN"), "0123");
    await user.type(screen.getByLabelText("Confirm PIN"), "0123");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(await screen.findByRole("heading", { name: "Create your PIN" })).toBeInTheDocument();
    expect(screen.getByLabelText("PIN")).toHaveValue("");
    expect(screen.getByLabelText("Confirm PIN")).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent("Setup could not be saved.");
  });

  it("updates appearance choices through the native bridge", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    await user.click(screen.getByRole("button", { name: "24-hour" }));
    await user.click(screen.getByRole("switch", { name: "Show seconds" }));

    await waitFor(() => expect(native.updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ clockFormat: "24h", showSeconds: true }),
    ));
  });

  it("supports every appearance choice through the native bridge", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    await user.selectOptions(screen.getByLabelText("Clock size"), "medium");
    await user.selectOptions(screen.getByLabelText("Gradient angle"), "135");
    expect(screen.getByLabelText("Gradient angle")).toHaveDisplayValue("135°");
    await user.click(screen.getByRole("button", { name: "Solid" }));
    await user.click(screen.getByRole("radio", { name: "Show on interaction" }));

    await waitFor(() => expect(native.updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clockSize: "medium",
        background: { kind: "solid", color: "#0D1324" },
        pinVisibility: "interaction",
      }),
    ));
  });

  it("allows hex colors to be edited as drafts and commits only valid values", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    const startColor = screen.getByLabelText("Start color", { selector: 'input[type="text"]' });
    const initialCalls = vi.mocked(native.updatePreferences).mock.calls.length;
    await user.clear(startColor);
    await user.type(startColor, "#a1b2c3");
    expect(startColor).toHaveValue("#A1B2C3");
    expect(native.updatePreferences).toHaveBeenCalledTimes(initialCalls);
    await user.tab();
    await waitFor(() => expect(native.updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        background: expect.objectContaining({ start: "#A1B2C3" }),
      }),
    ));

    const callsAfterValidCommit = vi.mocked(native.updatePreferences).mock.calls.length;
    await user.click(startColor);
    await user.clear(startColor);
    await user.type(startColor, "#12");
    await user.tab();
    expect(startColor).toHaveValue("#A1B2C3");
    expect(native.updatePreferences).toHaveBeenCalledTimes(callsAfterValidCommit);
  });

  it("supports startup, idle, and compatibility behavior choices", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Behavior" }));
    await user.click(screen.getByRole("switch", { name: "Launch at login" }));
    await user.click(screen.getByRole("switch", { name: "Activate cover after launch" }));
    await user.click(screen.getByRole("switch", { name: "Idle activation" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "1 minute",
      "5 minutes",
      "10 minutes",
      "15 minutes",
      "30 minutes",
      "60 minutes",
    ]);
    await user.selectOptions(screen.getByLabelText("Idle activation delay"), "30");
    await user.click(screen.getByRole("switch", { name: "Compatibility mode" }));

    await waitFor(() => expect(native.updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        launchAtLogin: true,
        coverAfterLaunch: true,
        idleMinutes: 30,
        compatibilityMode: false,
      }),
    ));
  });

  it("renders the autostart plugin state instead of stale persisted JSON", async () => {
    const staleSettings = {
      ...structuredClone(DEFAULT_SETTINGS),
      launchAtLogin: true,
      coverAfterLaunch: true,
    };
    const native = makeNativeClient(makeBootstrap({
      settings: staleSettings,
      autostartEnabled: false,
    }));
    setNativeClientForTests(native);
    render(<App />);

    expect(await screen.findByRole("switch", { name: "Launch at login" })).toHaveAttribute("aria-checked", "false");
    const coverAfterLaunch = screen.getByRole("switch", { name: "Cover after launch" });
    expect(coverAfterLaunch).toHaveAttribute("aria-checked", "false");
    expect(coverAfterLaunch).toBeDisabled();
  });

  it("rolls settings back and reports persistence failures without leaking a rejection", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    vi.mocked(native.updatePreferences).mockRejectedValueOnce(new Error("Autostart could not be enabled."));
    setNativeClientForTests(native);
    render(<App />);

    const launchAtLogin = await screen.findByRole("switch", { name: "Launch at login" });
    await user.click(launchAtLogin);
    expect(await screen.findByText("Autostart could not be enabled.")).toBeInTheDocument();
    expect(launchAtLogin).toHaveAttribute("aria-checked", "false");
  });

  it("preserves the requested settings section through every cover lifecycle transition", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    const stateHandler = vi.mocked(native.on).mock.calls.find(
      ([event]) => event === "visualcover://state",
    )?.[1];

    for (const lifecycle of ["covering", "covered", "uncovering"] as const) {
      await act(async () => stateHandler?.(lifecycle));
      expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Control" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "About" })).toBeEnabled();
    }
    await act(async () => {
      stateHandler?.("uncovered");
    });
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Control" })).toBeEnabled();
  });

  it("opens About only when the explicit native About event arrives", async () => {
    const native = makeNativeClient(makeBootstrap({ lifecycle: "covered" }));
    setNativeClientForTests(native);
    render(<App />);

    expect(await screen.findByText("Desktop is covered")).toBeInTheDocument();
    const openAbout = vi.mocked(native.on).mock.calls.find(
      ([event]) => event === "visualcover://open-about",
    )?.[1];
    await act(async () => openAbout?.(undefined));
    expect(await screen.findByText("The cover is active.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Control" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "About" })).toBeEnabled();
  });

  it("requires the explicit RESET confirmation for corrupt settings", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient(makeBootstrap({ configStatus: "corrupt", settings: undefined }));
    setNativeClientForTests(native);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "VisualCover needs your attention" })).toBeInTheDocument();
    const resetButton = screen.getByRole("button", { name: "Reset VisualCover" });
    expect(resetButton).toBeDisabled();
    await user.type(screen.getByLabelText("Reset confirmation"), "RESET");
    expect(resetButton).toBeEnabled();
    await user.click(resetButton);
    expect(native.resetCorruptConfiguration).toHaveBeenCalledWith("RESET");
  });

  it("allows a recovered-backup notification to be dismissed", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient(makeBootstrap({ configStatus: "recovered-from-backup" }));
    setNativeClientForTests(native);
    render(<App />);

    expect(await screen.findByText("Settings were restored from the last valid backup.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByText("Settings were restored from the last valid backup.")).not.toBeInTheDocument();
  });
});
