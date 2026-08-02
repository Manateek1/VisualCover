import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { millisecondsUntilNextSecond, useCurrentTime } from "./time";

function ClockProbe({ name }: { name: string }) {
  const now = useCurrentTime();
  return <output aria-label={name}>{now.toISOString()}</output>;
}

describe("synchronized clock ticks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aligns updates to the next wall-clock second", () => {
    expect(millisecondsUntilNextSecond(250)).toBe(770);
    expect(millisecondsUntilNextSecond(1_020)).toBe(1_000);
  });

  it("brings independently mounted clocks onto the same boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00.250Z"));
    const { rerender } = render(<><ClockProbe name="primary" /></>);

    act(() => vi.advanceTimersByTime(300));
    rerender(
      <>
        <ClockProbe name="primary" />
        <ClockProbe name="secondary" />
      </>,
    );
    expect(screen.getByLabelText("primary")).not.toHaveTextContent(
      screen.getByLabelText("secondary").textContent ?? "",
    );

    act(() => vi.advanceTimersByTime(470));
    expect(screen.getByLabelText("primary")).toHaveTextContent("2026-08-02T12:00:01.020Z");
    expect(screen.getByLabelText("secondary")).toHaveTextContent("2026-08-02T12:00:01.020Z");
  });
});
