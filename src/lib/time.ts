import { useEffect, useMemo, useState } from "react";
import type { PublicSettings } from "../types";

const CLOCK_BOUNDARY_SLOP_MS = 20;

export function millisecondsUntilNextSecond(now: number): number {
  return 1_000 - (now % 1_000) + CLOCK_BOUNDARY_SLOP_MS;
}

export function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = window.setTimeout(tick, millisecondsUntilNextSecond(current.getTime()));
    };
    timer = window.setTimeout(tick, millisecondsUntilNextSecond(Date.now()));
    return () => window.clearTimeout(timer);
  }, []);

  return now;
}

export function useFormattedTime(now: Date, settings: PublicSettings) {
  return useMemo(() => {
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: settings.showSeconds ? "2-digit" : undefined,
      hour12: settings.clockFormat === "12h",
    });
    const time = timeFormatter
      .formatToParts(now)
      .filter((part) => part.type !== "dayPeriod")
      .map((part) => part.value)
      .join("")
      .trim();

    const date = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now);

    return { time, date };
  }, [now, settings.clockFormat, settings.showSeconds]);
}
