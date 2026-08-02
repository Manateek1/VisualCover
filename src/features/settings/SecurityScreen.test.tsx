import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../types";
import { SecurityScreen } from "./SecurityScreen";

describe("security settings", () => {
  it.each([
    { name: "successful", result: "resolve" as const },
    { name: "failed", result: "reject" as const },
  ])("clears every PIN field after a $name change attempt", async ({ result }) => {
    const user = userEvent.setup();
    const onChangePin = result === "resolve"
      ? vi.fn(async () => undefined)
      : vi.fn(async () => { throw new Error("Current PIN is incorrect."); });
    render(
      <SecurityScreen
        settings={DEFAULT_SETTINGS}
        onChangePin={onChangePin}
        onConfigureEmergencyUnlock={vi.fn(async () => undefined)}
      />,
    );

    const currentPin = screen.getByLabelText("Current PIN");
    const newPin = screen.getByLabelText("New PIN");
    const confirmation = screen.getByLabelText("Confirm new PIN");
    await user.type(currentPin, "1234");
    await user.type(newPin, "5678");
    await user.type(confirmation, "5678");
    await user.click(screen.getByRole("button", { name: "Change PIN" }));

    await waitFor(() => expect(onChangePin).toHaveBeenCalledWith("1234", "5678"));
    expect(currentPin).toHaveValue("");
    expect(newPin).toHaveValue("");
    expect(confirmation).toHaveValue("");
    expect(screen.getByRole(result === "resolve" ? "status" : "alert")).toBeInTheDocument();
  });

  it("traps focus, closes on Escape, and restores focus to the invoking control", async () => {
    const user = userEvent.setup();
    render(
      <SecurityScreen
        settings={DEFAULT_SETTINGS}
        onChangePin={vi.fn(async () => undefined)}
        onConfigureEmergencyUnlock={vi.fn(async () => undefined)}
      />,
    );

    const emergencySwitch = screen.getByRole("switch", { name: "Enable emergency unlock" });
    await user.click(emergencySwitch);
    const dialog = screen.getByRole("dialog", { name: "Confirm with your PIN" });
    const pin = within(dialog).getByLabelText("Current PIN");
    expect(pin).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(pin).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(emergencySwitch).toHaveFocus());
  });

  it("authenticates emergency enablement and each allowed shortcut change", async () => {
    const user = userEvent.setup();
    const configure = vi.fn(async () => undefined);
    const { rerender } = render(
      <SecurityScreen
        settings={DEFAULT_SETTINGS}
        onChangePin={vi.fn(async () => undefined)}
        onConfigureEmergencyUnlock={configure}
      />,
    );

    const emergencySwitch = screen.getByRole("switch", { name: "Enable emergency unlock" });
    await user.click(emergencySwitch);
    await user.type(within(screen.getByRole("dialog")).getByLabelText("Current PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(configure).toHaveBeenLastCalledWith("1234", {
      enabled: true,
      shortcut: "Ctrl+Alt+Shift+U",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const enabledSettings = {
      ...DEFAULT_SETTINGS,
      emergencyUnlock: { enabled: true, shortcut: "Ctrl+Alt+Shift+U" },
    };
    rerender(
      <SecurityScreen
        settings={enabledSettings}
        onChangePin={vi.fn(async () => undefined)}
        onConfigureEmergencyUnlock={configure}
      />,
    );
    const shortcut = screen.getByLabelText("Shortcut");
    expect(shortcut.querySelectorAll("option")).toHaveLength(37);
    await user.selectOptions(shortcut, "Ctrl+Alt+Shift+F11");
    await user.type(within(screen.getByRole("dialog")).getByLabelText("Current PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(configure).toHaveBeenLastCalledWith("1234", {
      enabled: true,
      shortcut: "Ctrl+Alt+Shift+F11",
    });
  });
});
