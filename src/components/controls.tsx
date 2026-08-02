import type { ReactNode } from "react";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
};

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? "switch--checked" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? "segmented__button segmented__button--active" : "segmented__button"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type SettingRowProps = {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SettingRow({ label, description, children, className = "" }: SettingRowProps) {
  return (
    <div className={`setting-row ${className}`.trim()}>
      <div className="setting-row__copy">
        <div className="setting-row__label">{label}</div>
        {description ? <div className="setting-row__description">{description}</div> : null}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

type PinInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  showValue?: boolean;
  onToggleVisibility?: () => void;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
};

export function PinInput({
  id,
  label,
  value,
  onChange,
  autoFocus,
  showValue = false,
  onToggleVisibility,
  placeholder,
  disabled,
  inputRef,
  className = "",
}: PinInputProps) {
  return (
    <div className={`field ${className}`.trim()}>
      <label className="field__label" htmlFor={id}>{label}</label>
      <span className="field__input-wrap">
        <input
          ref={inputRef}
          id={id}
          className="field__input field__input--pin"
          type={showValue ? "text" : "password"}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={12}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 12))}
        />
        {onToggleVisibility ? (
          <button
            type="button"
            className="field__icon-button"
            aria-label={showValue ? `Hide ${label}` : `Show ${label}`}
            onClick={onToggleVisibility}
          >
            {showValue ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7A2 2 0 0013.3 13M9.9 4.2A10.8 10.8 0 0112 4c5 0 8.5 4.5 8.5 4.5a15 15 0 01-2.2 2.5M6.6 6.6A16 16 0 003.5 8.5S7 13 12 13c.8 0 1.6-.1 2.3-.3" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12S7 7.5 12 7.5 20.5 12 20.5 12 17 16.5 12 16.5 3.5 12 3.5 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
            )}
          </button>
        ) : null}
      </span>
    </div>
  );
}
