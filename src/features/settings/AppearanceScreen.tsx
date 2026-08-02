import { useEffect, useState } from "react";
import { CurtainArt } from "../../components/CurtainArt";
import { Segmented, SettingRow, Switch } from "../../components/controls";
import { useCurrentTime, useFormattedTime } from "../../lib/time";
import type { Background, PublicSettings } from "../../types";

type AppearanceScreenProps = {
  settings: PublicSettings;
  onSettingsChange: (settings: PublicSettings) => Promise<void>;
};

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function AppearanceScreen({ settings, onSettingsChange }: AppearanceScreenProps) {
  const now = useCurrentTime();
  const formatted = useFormattedTime(now, settings);
  const background = settings.background;
  const start = background.kind === "gradient" ? background.start : background.color;
  const end = background.kind === "gradient" ? background.end : "#124557";

  const update = (change: Partial<PublicSettings>) =>
    onSettingsChange({ ...settings, ...change });
  const setBackground = (value: Background) => update({ background: value });

  return (
    <div className="screen appearance-screen">
      <div className="appearance-screen__controls">
        <h1>Appearance</h1>
        <section className="settings-section">
          <h2>Clock</h2>
          <Segmented
            label="Clock format"
            value={settings.clockFormat}
            options={[{ value: "12h", label: "12-hour" }, { value: "24h", label: "24-hour" }]}
            onChange={(clockFormat) => void update({ clockFormat })}
          />
          <SettingRow label="Show seconds">
            <Switch label="Show seconds" checked={settings.showSeconds} onChange={(showSeconds) => void update({ showSeconds })} />
          </SettingRow>
          <SettingRow label="Show date">
            <Switch label="Show date" checked={settings.showDate} onChange={(showDate) => void update({ showDate })} />
          </SettingRow>
          <SettingRow label="Clock size">
            <select
              aria-label="Clock size"
              value={settings.clockSize}
              onChange={(event) => void update({ clockSize: event.target.value as PublicSettings["clockSize"] })}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </SettingRow>
        </section>

        <section className="settings-section">
          <h2>Background</h2>
          <Segmented
            label="Background style"
            value={background.kind}
            options={[{ value: "gradient", label: "Gradient" }, { value: "solid", label: "Solid" }]}
            onChange={(kind) => void setBackground(
              kind === "gradient"
                ? { kind, start, end, angle: 90 }
                : { kind, color: start },
            )}
          />
          <ColorRow
            label={background.kind === "gradient" ? "Start color" : "Color"}
            value={start}
            onChange={(value) => {
              if (!isHex(value)) return;
              void setBackground(background.kind === "gradient" ? { ...background, start: value } : { ...background, color: value });
            }}
          />
          {background.kind === "gradient" ? (
            <>
              <ColorRow label="End color" value={end} onChange={(value) => {
                if (isHex(value)) void setBackground({ ...background, end: value });
              }} />
              <SettingRow label="Gradient angle">
                <select
                  aria-label="Gradient angle"
                  value={background.angle}
                  onChange={(event) => void setBackground({ ...background, angle: Number(event.target.value) as 0 | 45 | 90 | 135 })}
                >
                  {[0, 45, 90, 135].map((angle) => <option key={angle} value={angle}>{angle}°</option>)}
                </select>
              </SettingRow>
            </>
          ) : null}
        </section>

        <section className="settings-section settings-section--last">
          <h2>PIN prompt</h2>
          <label className="radio-row">
            <input type="radio" name="pin-visibility" checked={settings.pinVisibility === "always"} onChange={() => void update({ pinVisibility: "always" })} />
            <span>Always visible</span>
          </label>
          <label className="radio-row">
            <input type="radio" name="pin-visibility" checked={settings.pinVisibility === "interaction"} onChange={() => void update({ pinVisibility: "interaction" })} />
            <span>Show on interaction</span>
          </label>
        </section>
      </div>

      <div className="appearance-screen__preview" aria-label="Live cover preview">
        <CurtainArt settings={settings} compact>
          <div className={`preview-clock preview-clock--${settings.clockSize}`}>
            <span>{formatted.time}</span>
            {settings.showDate ? <small>{formatted.date}</small> : null}
            <div className="preview-pin-dots" aria-hidden="true"><i /><i /><i /><i /></div>
          </div>
        </CurtainArt>
      </div>
    </div>
  );
}

type ColorRowProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function ColorRow({ label, value, onChange }: ColorRowProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitDraft = () => {
    const normalized = draft.toUpperCase();
    if (isHex(normalized)) {
      setDraft(normalized);
      if (normalized !== value) onChange(normalized);
    } else {
      setDraft(value);
    }
  };

  return (
    <SettingRow label={label}>
      <div className="color-control">
        <input type="color" aria-label={`${label} picker`} value={value} onChange={(event) => {
          const next = event.target.value.toUpperCase();
          setDraft(next);
          onChange(next);
        }} />
        <input
          type="text"
          aria-label={label}
          value={draft}
          maxLength={7}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setDraft(value);
            }
          }}
        />
      </div>
    </SettingRow>
  );
}
