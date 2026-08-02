import { Clock3, Power, ShieldCheck } from "lucide-react";
import { CurtainArt } from "../../components/CurtainArt";
import { SettingRow, Switch } from "../../components/controls";
import { useCurrentTime, useFormattedTime } from "../../lib/time";
import type { CoverLifecycle, PublicSettings } from "../../types";

type ControlScreenProps = {
  version: string;
  lifecycle: CoverLifecycle;
  settings: PublicSettings;
  onActivate: () => Promise<void>;
  onSettingsChange: (settings: PublicSettings) => Promise<void>;
};

export function ControlScreen({
  version,
  lifecycle,
  settings,
  onActivate,
  onSettingsChange,
}: ControlScreenProps) {
  const now = useCurrentTime();
  const formatted = useFormattedTime(now, settings);
  const busy = lifecycle === "covering" || lifecycle === "uncovering";
  const covered = lifecycle === "covered";

  const patch = (change: Partial<PublicSettings>) =>
    onSettingsChange({ ...settings, ...change });

  return (
    <div className="screen control-screen">
      <div className="control-screen__copy">
        <h1>VisualCover</h1>
        <div className={`status-line ${covered ? "status-line--covered" : ""}`}>
          <span className="status-line__dot" />
          <span>{covered ? "Desktop is covered" : busy ? "Updating cover…" : "Desktop is uncovered"}</span>
        </div>
        <button
          type="button"
          className="button button--primary button--activate"
          disabled={lifecycle !== "uncovered"}
          onClick={() => void onActivate()}
        >
          {covered ? "Cover active" : busy ? "Activating…" : "Activate cover"}
        </button>

        <div className="privacy-note">
          <ShieldCheck aria-hidden="true" />
          <span>VisualCover is a privacy curtain, not a Windows lock screen.</span>
        </div>

        <div className="control-quick-settings">
          <SettingRow label={<><Power aria-hidden="true" />Launch at login</>}>
            <Switch
              label="Launch at login"
              checked={settings.launchAtLogin}
              onChange={(launchAtLogin) => void patch({
                launchAtLogin,
                coverAfterLaunch: launchAtLogin ? settings.coverAfterLaunch : false,
              })}
            />
          </SettingRow>
          <SettingRow label={<><Clock3 aria-hidden="true" />Cover after launch</>}>
            <Switch
              label="Cover after launch"
              checked={settings.coverAfterLaunch}
              disabled={!settings.launchAtLogin}
              onChange={(coverAfterLaunch) => void patch({ coverAfterLaunch })}
            />
          </SettingRow>
        </div>
        <p className="version-line">Version {version}</p>
      </div>

      <div className="control-screen__preview" aria-label="Cover preview">
        <CurtainArt settings={settings} compact>
          <div className="mini-clock">
            <span>{formatted.time}</span>
            {settings.showDate ? <small>{formatted.date}</small> : null}
          </div>
        </CurtainArt>
      </div>
    </div>
  );
}
