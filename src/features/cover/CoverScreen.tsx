import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { CurtainArt } from "../../components/CurtainArt";
import { getNativeClient } from "../../lib/native";
import { useCurrentTime, useFormattedTime } from "../../lib/time";
import type { CoverWindowContext, PublicSettings } from "../../types";

type CoverScreenProps = {
  settings: PublicSettings;
  context: CoverWindowContext;
};

export function CoverScreen({ settings, context }: CoverScreenProps) {
  const native = getNativeClient();
  const now = useCurrentTime();
  const formatted = useFormattedTime(now, settings);
  const inputRef = useRef<HTMLInputElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const errorTimer = useRef<number | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [promptVisible, setPromptVisible] = useState(settings.pinVisibility === "always");
  const [unlockedInPreview, setUnlockedInPreview] = useState(false);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = undefined;
    if (settings.pinVisibility === "always" || pin) return;
    hideTimer.current = window.setTimeout(() => setPromptVisible(false), 8_000);
  }, [pin, settings.pinVisibility]);

  const revealPrompt = useCallback((focus = false) => {
    setPromptVisible(true);
    if (focus) window.setTimeout(() => inputRef.current?.focus(), 0);
    scheduleHide();
  }, [scheduleHide]);
  const revealPromptRef = useRef(revealPrompt);

  useEffect(() => {
    revealPromptRef.current = revealPrompt;
  }, [revealPrompt]);

  useEffect(() => {
    scheduleHide();
    if (settings.pinVisibility === "always") {
      setPromptVisible(true);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [pin, scheduleHide, settings.pinVisibility]);

  useEffect(() => {
    void native.coverWindowReady(context.sessionId);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void native.on("visualcover://reveal-pin", () => revealPromptRef.current(true)).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [context.sessionId, native]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || (event.altKey && event.key === "F4")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!context.primary) return;
      if (settings.pinVisibility === "interaction" && !promptVisible) {
        if (/^\d$/.test(event.key)) {
          event.preventDefault();
          setPin(event.key);
        }
        revealPrompt(true);
      } else if (event.key.length === 1) {
        revealPrompt(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [context.primary, promptVisible, revealPrompt, settings.pinVisibility]);

  useEffect(() => () => {
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(errorTimer.current);
  }, []);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!pin || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const valid = await native.unlock(pin);
      setPin("");
      if (!valid) {
        setError("Incorrect PIN. Try again.");
        inputRef.current?.focus();
        window.clearTimeout(errorTimer.current);
        errorTimer.current = window.setTimeout(() => setError(""), 1_500);
      } else if (!native.isNative) {
        setUnlockedInPreview(true);
      }
    } catch (cause) {
      setPin("");
      setError(cause instanceof Error ? cause.message : "Unable to verify PIN.");
      inputRef.current?.focus();
      window.clearTimeout(errorTimer.current);
      errorTimer.current = window.setTimeout(() => setError(""), 1_500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="cover-screen"
      onPointerMove={() => {
        if (context.primary && settings.pinVisibility === "interaction") revealPrompt(false);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <CurtainArt settings={settings}>
        <div className={`cover-clock cover-clock--${settings.clockSize}`}>
          <time>{formatted.time}</time>
          {settings.showDate ? <p>{formatted.date}</p> : null}
        </div>

        {context.primary ? (
          <form
            className={`cover-unlock ${promptVisible ? "cover-unlock--visible" : ""}`}
            aria-hidden={!promptVisible}
            onSubmit={(event) => void submit(event)}
          >
            <label htmlFor="cover-pin">Enter PIN to uncover</label>
            <input
              ref={inputRef}
              id="cover-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={12}
              autoComplete="off"
              value={pin}
              disabled={submitting || unlockedInPreview}
              onFocus={() => revealPrompt(false)}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, "").slice(0, 12));
                setError("");
              }}
              aria-describedby="cover-pin-status"
            />
            <button type="submit" aria-label="Uncover desktop" disabled={!pin || submitting || unlockedInPreview}>
              <ArrowRight aria-hidden="true" />
            </button>
            <p id="cover-pin-status" className={`cover-error ${error ? "cover-error--visible" : ""}`} role="alert" aria-live="assertive">
              {unlockedInPreview ? "Desktop uncovered" : error}
            </p>
          </form>
        ) : null}

        <div className="cover-wordmark" aria-label="VisualCover"><span>Visual</span><span>Cover</span></div>
      </CurtainArt>
    </main>
  );
}
