import { useMemo, useState } from "react";
import { ArrowRight, Check, CircleCheck, MonitorUp, ShieldCheck } from "lucide-react";
import { BrandMark } from "../../components/BrandMark";
import { PinInput, SettingRow, Switch } from "../../components/controls";
import { WindowChrome } from "../../components/WindowChrome";
import { isNumericPin, type PublicSettings } from "../../types";

type OnboardingProps = {
  initialSettings: PublicSettings;
  onComplete: (pin: string, settings: PublicSettings) => Promise<void>;
};

const steps = ["Welcome", "Create PIN", "Startup"] as const;

export function Onboarding({ initialSettings, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pinValid = isNumericPin(pin);
  const pinsMatch = pinValid && pin === confirmation;
  const stepTitle = steps[step] ?? steps[0];

  const startupSummary = useMemo(() => {
    if (!settings.launchAtLogin) return "Start VisualCover yourself when you need it.";
    if (settings.coverAfterLaunch) return "Launch at sign-in and activate the cover automatically.";
    return "Launch quietly in the tray when you sign in.";
  }, [settings.coverAfterLaunch, settings.launchAtLogin]);

  const finish = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onComplete(pin, settings);
    } catch (cause) {
      setPin("");
      setConfirmation("");
      setShowPin(false);
      setShowConfirmation(false);
      setStep(1);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="onboarding-shell">
      <WindowChrome />
      <aside className="onboarding-sidebar" aria-label="Setup progress">
        <BrandMark />
        <ol className="setup-steps">
          {steps.map((label, index) => {
            const complete = index < step;
            const active = index === step;
            return (
              <li
                key={label}
                className={`setup-step ${active ? "setup-step--active" : ""} ${complete ? "setup-step--complete" : ""}`.trim()}
                aria-current={active ? "step" : undefined}
              >
                <span className="setup-step__marker">
                  {complete ? <Check aria-hidden="true" /> : index + 1}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      <section className="onboarding-content" aria-labelledby="setup-heading">
        <div className={`onboarding-panel onboarding-panel--${stepTitle.toLowerCase().replace(" ", "-")}`}>
          {step === 0 ? (
            <>
              <div className="welcome-mark" aria-hidden="true"><ShieldCheck /></div>
              <h1 id="setup-heading">Welcome to VisualCover</h1>
              <p className="onboarding-lead">
                A calm visual curtain for your desktop that leaves background apps running.
              </p>
              <div className="welcome-points">
                <div><MonitorUp aria-hidden="true" /><span>Covers every connected display</span></div>
                <div><ArrowRight aria-hidden="true" /><span>Returns to your desktop after your PIN</span></div>
              </div>
              <div className="notice-card">
                <ShieldCheck aria-hidden="true" />
                <p>
                  VisualCover is not a Windows lock screen. Windows remains signed in and
                  background programs keep running.
                </p>
              </div>
              <button type="button" className="button button--primary button--wide" onClick={() => setStep(1)}>
                Get started
              </button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h1 id="setup-heading">Create your PIN</h1>
              <p className="onboarding-lead">Use 4–12 digits. Your PIN is hashed and stored only on this device.</p>
              <form
                className="pin-setup-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (pinsMatch) {
                    setError("");
                    setStep(2);
                  }
                }}
              >
                <PinInput
                  id="setup-pin"
                  label="PIN"
                  value={pin}
                  onChange={setPin}
                  autoFocus
                  showValue={showPin}
                  onToggleVisibility={() => setShowPin((value) => !value)}
                />
                <PinInput
                  id="setup-confirm-pin"
                  label="Confirm PIN"
                  value={confirmation}
                  onChange={setConfirmation}
                  showValue={showConfirmation}
                  onToggleVisibility={() => setShowConfirmation((value) => !value)}
                />
                <div className="pin-checks" aria-live="polite">
                  <div
                    className={pinValid ? "pin-check pin-check--valid" : "pin-check"}
                    aria-label={pinValid ? "PIN contains 4–12 numbers" : "PIN must contain 4–12 numbers"}
                  >
                    <CircleCheck aria-hidden="true" />
                    <span>4–12 numbers</span>
                  </div>
                  <div
                    className={pinsMatch ? "pin-check pin-check--valid" : "pin-check"}
                    aria-label={pinsMatch ? "PINs match" : "PINs do not match"}
                  >
                    <CircleCheck aria-hidden="true" />
                    <span>PINs match</span>
                  </div>
                </div>
                {error ? <div className="form-error" role="alert">{error}</div> : null}
                <button type="submit" className="button button--primary button--wide" disabled={!pinsMatch}>
                  Continue
                </button>
                <button type="button" className="button button--ghost" onClick={() => setStep(0)}>Back</button>
              </form>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 id="setup-heading">Choose startup behavior</h1>
              <p className="onboarding-lead">You can change these options later in Behavior.</p>
              <div className="startup-options">
                <SettingRow
                  label="Launch at login"
                  description="Start VisualCover quietly after you sign in."
                >
                  <Switch
                    label="Launch at login"
                    checked={settings.launchAtLogin}
                    onChange={(launchAtLogin) => setSettings((current) => ({
                      ...current,
                      launchAtLogin,
                      coverAfterLaunch: launchAtLogin ? current.coverAfterLaunch : false,
                    }))}
                  />
                </SettingRow>
                <SettingRow
                  label="Activate cover after launch"
                  description="Applies only after this first-run setup."
                >
                  <Switch
                    label="Activate cover after launch"
                    checked={settings.coverAfterLaunch}
                    disabled={!settings.launchAtLogin}
                    onChange={(coverAfterLaunch) => setSettings((current) => ({ ...current, coverAfterLaunch }))}
                  />
                </SettingRow>
              </div>
              <p className="startup-summary">{startupSummary}</p>
              {error ? <div className="form-error" role="alert">{error}</div> : null}
              <button
                type="button"
                className="button button--primary button--wide"
                disabled={submitting}
                onClick={() => void finish()}
              >
                {submitting ? "Finishing…" : "Finish setup"}
              </button>
              <button type="button" className="button button--ghost" onClick={() => setStep(1)}>Back</button>
            </>
          ) : null}
        </div>

        <div className="onboarding-footer">
          <ShieldCheck aria-hidden="true" />
          <span>VisualCover is not a Windows lock screen. Background apps keep running.</span>
        </div>
      </section>
    </main>
  );
}
