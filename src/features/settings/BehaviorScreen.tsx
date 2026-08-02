import { Info } from "lucide-react";
import { SettingRow, Switch } from "../../components/controls";
import type { IdleMinutes, PublicSettings } from "../../types";

type BehaviorScreenProps = {
  settings: PublicSettings;
  idleSupported: boolean;
  onSettingsChange: (settings: PublicSettings) => Promise<void>;
};

const idleOptions: Array<{ value: IdleMinutes; label: string }> = [
  { value: null, label: "Off" },
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "60 minutes" },
];

export function BehaviorScreen({ settings, idleSupported, onSettingsChange }: BehaviorScreenProps) {
  const update = (change: Partial<PublicSettings>) =>
    onSettingsChange({ ...settings, ...change });
  const idleEnabled = settings.idleMinutes !== null;

  return (
    <div className="screen behavior-screen">
      <div className="behavior-screen__content">
        <h1>Behavior</h1>
        <section className="settings-section behavior-section">
          <h2>Startup</h2>
          <SettingRow label="Launch at login">
            <Switch
              label="Launch at login"
              checked={settings.launchAtLogin}
              onChange={(launchAtLogin) => void update({
                launchAtLogin,
                coverAfterLaunch: launchAtLogin ? settings.coverAfterLaunch : false,
              })}
            />
          </SettingRow>
          <SettingRow label="Activate cover after launch" description="Applies after first-run setup.">
            <Switch
              label="Activate cover after launch"
              checked={settings.coverAfterLaunch}
              disabled={!settings.launchAtLogin}
              onChange={(coverAfterLaunch) => void update({ coverAfterLaunch })}
            />
          </SettingRow>
        </section>

        <section className="settings-section behavior-section">
          <h2>Idle activation</h2>
          <SettingRow label="Idle activation">
            <Switch
              label="Idle activation"
              checked={idleEnabled}
              disabled={!idleSupported}
              onChange={(enabled) => void update({ idleMinutes: enabled ? 10 : null })}
            />
          </SettingRow>
          <SettingRow
            label="Delay"
            description={idleSupported ? "Uses Windows system idle time. Available on Windows 11." : "System idle detection is unavailable on macOS."}
          >
            <select
              aria-label="Idle activation delay"
              disabled={!idleSupported || !idleEnabled}
              value={settings.idleMinutes ?? ""}
              onChange={(event) => void update({ idleMinutes: Number(event.target.value) as Exclude<IdleMinutes, null> })}
            >
              {idleOptions.filter((item) => item.value !== null).map((item) => (
                <option key={item.label} value={item.value ?? ""}>{item.label}</option>
              ))}
            </select>
          </SettingRow>
        </section>

        <section className="settings-section behavior-section behavior-section--compatibility">
          <h2>Automation compatibility</h2>
          <SettingRow
            label="Compatibility mode"
            description="Keeps the cover visually on top without repeatedly taking focus."
          >
            <Switch
              label="Compatibility mode"
              checked={settings.compatibilityMode}
              onChange={(compatibilityMode) => void update({ compatibilityMode })}
            />
          </SettingRow>
          <div className="info-line">
            <Info aria-hidden="true" />
            <span>Recommended for Playwright, Chrome automation, and background server tasks.</span>
          </div>
        </section>
      </div>

      <div className="automation-illustration" aria-hidden="true">
        <div className="automation-illustration__curtains">
          {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
        </div>
        <div className="automation-illustration__rows">
          <span /><span /><span /><span /><span /><span /><span />
        </div>
      </div>
    </div>
  );
}
