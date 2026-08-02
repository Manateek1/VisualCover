import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setNativeClientForTests } from "../../lib/native";
import { makeNativeClient } from "../../test/nativeMock";
import { DEFAULT_SETTINGS, type CoverWindowContext } from "../../types";
import { CoverScreen } from "./CoverScreen";

const primaryContext: CoverWindowContext = {
  isCover: true,
  primary: true,
  sessionId: "session-test",
  index: 0,
};

describe("cover screen", () => {
  afterEach(() => {
    setNativeClientForTests(undefined);
    vi.useRealTimers();
  });

  it("clears and refocuses after an incorrect PIN", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    vi.mocked(native.unlock).mockResolvedValue(false);
    setNativeClientForTests(native);
    render(<CoverScreen settings={DEFAULT_SETTINGS} context={primaryContext} />);

    const input = screen.getByLabelText("Enter PIN to uncover");
    await user.type(input, "0000");
    await user.click(screen.getByRole("button", { name: "Uncover desktop" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect PIN. Try again.");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("keeps each incorrect-PIN error visible for exactly 1.5 seconds", async () => {
    vi.useFakeTimers();
    const native = makeNativeClient();
    vi.mocked(native.unlock).mockResolvedValue(false);
    setNativeClientForTests(native);
    render(<CoverScreen settings={DEFAULT_SETTINGS} context={primaryContext} />);

    const input = screen.getByLabelText("Enter PIN to uncover");
    const form = input.closest("form")!;
    fireEvent.change(input, { target: { value: "0000" } });
    await act(async () => {
      fireEvent.submit(form);
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect PIN. Try again.");

    act(() => vi.advanceTimersByTime(1_000));
    fireEvent.change(input, { target: { value: "1111" } });
    await act(async () => {
      fireEvent.submit(form);
      await Promise.resolve();
    });

    act(() => vi.advanceTimersByTime(1_499));
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect PIN. Try again.");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("preserves the first number that reveals an interaction-only prompt", () => {
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<CoverScreen settings={{ ...DEFAULT_SETTINGS, pinVisibility: "interaction" }} context={primaryContext} />);

    const form = screen.getByText("Enter PIN to uncover").closest("form");
    expect(form).toHaveAttribute("aria-hidden", "true");
    fireEvent.keyDown(window, { key: "7", code: "Digit7", cancelable: true });
    expect(form).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByLabelText("Enter PIN to uncover")).toHaveValue("7");
  });

  it("hides after eight empty seconds but never while a PIN is entered", () => {
    vi.useFakeTimers();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<CoverScreen settings={{ ...DEFAULT_SETTINGS, pinVisibility: "interaction" }} context={primaryContext} />);

    const input = screen.getByLabelText("Enter PIN to uncover");
    const form = input.closest("form")!;
    fireEvent.keyDown(window, { key: "7", code: "Digit7", cancelable: true });
    act(() => vi.advanceTimersByTime(8_000));
    expect(form).toHaveAttribute("aria-hidden", "false");
    expect(input).toHaveValue("7");

    fireEvent.change(input, { target: { value: "" } });
    act(() => vi.advanceTimersByTime(7_999));
    expect(form).toHaveAttribute("aria-hidden", "false");
    act(() => vi.advanceTimersByTime(1));
    expect(form).toHaveAttribute("aria-hidden", "true");
  });

  it("reveals and focuses the PIN input when native tray actions request it", async () => {
    vi.useFakeTimers();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<CoverScreen settings={{ ...DEFAULT_SETTINGS, pinVisibility: "interaction" }} context={primaryContext} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(native.on).toHaveBeenCalledWith("visualcover://reveal-pin", expect.any(Function));
    const reveal = vi.mocked(native.on).mock.calls.find(
      ([event]) => event === "visualcover://reveal-pin",
    )?.[1];
    act(() => {
      reveal?.(undefined);
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByText("Enter PIN to uncover").closest("form")).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByLabelText("Enter PIN to uncover")).toHaveFocus();
  });

  it("reports readiness and installs the native reveal listener only once", async () => {
    const user = userEvent.setup();
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<CoverScreen settings={DEFAULT_SETTINGS} context={primaryContext} />);

    const input = screen.getByLabelText("Enter PIN to uncover");
    await user.type(input, "1234");
    expect(native.coverWindowReady).toHaveBeenCalledTimes(1);
    expect(native.coverWindowReady).toHaveBeenCalledWith("session-test");
    expect(vi.mocked(native.on).mock.calls.filter(
      ([event]) => event === "visualcover://reveal-pin",
    )).toHaveLength(1);
  });

  it("consumes Escape while covered", () => {
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<CoverScreen settings={DEFAULT_SETTINGS} context={primaryContext} />);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  });

  it("consumes Alt+F4 while covered", () => {
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<CoverScreen settings={DEFAULT_SETTINGS} context={primaryContext} />);
    const event = new KeyboardEvent("keydown", {
      key: "F4",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  });

  it("omits the PIN interface on secondary monitors", () => {
    const native = makeNativeClient();
    setNativeClientForTests(native);
    render(<CoverScreen settings={DEFAULT_SETTINGS} context={{ ...primaryContext, primary: false, index: 1 }} />);
    expect(screen.queryByLabelText("Enter PIN to uncover")).not.toBeInTheDocument();
    expect(native.coverWindowReady).toHaveBeenCalledWith("session-test");
  });
});
