import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, LockKeyhole, TriangleAlert, Unlock } from "lucide-react";
import { PinInput, Switch } from "../../components/controls";
import {
  isNumericPin,
  type EmergencyUnlockConfig,
  type PublicSettings,
} from "../../types";

type SecurityScreenProps = {
  settings: PublicSettings;
  onChangePin: (currentPin: string, newPin: string) => Promise<void>;
  onConfigureEmergencyUnlock: (
    currentPin: string,
    config: EmergencyUnlockConfig,
  ) => Promise<void>;
};

type PendingEmergencyChange = EmergencyUnlockConfig | null;

const shortcutOptions = [
  ...Array.from({ length: 26 }, (_, index) => `Ctrl+Alt+Shift+${String.fromCharCode(65 + index)}`),
  ...Array.from({ length: 11 }, (_, index) => `Ctrl+Alt+Shift+F${index + 1}`),
];

export function SecurityScreen({ settings, onChangePin, onConfigureEmergencyUnlock }: SecurityScreenProps) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMessage, setPinMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [pendingEmergency, setPendingEmergency] = useState<PendingEmergencyChange>(null);
  const [emergencyPin, setEmergencyPin] = useState("");
  const [emergencyError, setEmergencyError] = useState("");
  const [savingEmergency, setSavingEmergency] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const newPinValid = isNumericPin(newPin) && newPin === confirmPin;
  const canChangePin = isNumericPin(currentPin) && newPinValid;
  const emergency = settings.emergencyUnlock;
  const shortcutLabel = useMemo(
    () => shortcutOptions.includes(emergency.shortcut) ? emergency.shortcut : "Ctrl+Alt+Shift+U",
    [emergency.shortcut],
  );

  const closeEmergencyDialog = useCallback(() => {
    setPendingEmergency(null);
    setEmergencyPin("");
    setEmergencyError("");
    const restoreTarget = restoreFocusRef.current;
    window.setTimeout(() => restoreTarget?.focus(), 0);
  }, []);

  const requestEmergencyChange = (config: EmergencyUnlockConfig) => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setEmergencyError("");
    setPendingEmergency(config);
  };

  useEffect(() => {
    if (!pendingEmergency) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEmergencyDialog();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeEmergencyDialog, pendingEmergency]);

  const submitPinChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canChangePin) return;
    setChangingPin(true);
    setPinMessage(null);
    try {
      await onChangePin(currentPin, newPin);
      setPinMessage({ kind: "success", text: "PIN changed successfully." });
    } catch (cause) {
      setPinMessage({ kind: "error", text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setChangingPin(false);
    }
  };

  const submitEmergency = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingEmergency || !isNumericPin(emergencyPin)) return;
    setSavingEmergency(true);
    setEmergencyError("");
    try {
      await onConfigureEmergencyUnlock(emergencyPin, pendingEmergency);
      closeEmergencyDialog();
    } catch (cause) {
      setEmergencyPin("");
      setEmergencyError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingEmergency(false);
    }
  };

  return (
    <div className="screen security-screen">
      <h1>Security</h1>
      <section className="security-section">
        <div className="security-section__heading">
          <LockKeyhole aria-hidden="true" />
          <h2>Change PIN</h2>
          <ChevronUp aria-hidden="true" />
        </div>
        <form className="security-form" onSubmit={(event) => void submitPinChange(event)}>
          <PinInput id="current-pin" label="Current PIN" value={currentPin} onChange={setCurrentPin} />
          <PinInput id="new-pin" label="New PIN" value={newPin} onChange={setNewPin} />
          <PinInput id="confirm-new-pin" label="Confirm new PIN" value={confirmPin} onChange={setConfirmPin} />
          <p className="security-form__hint">PINs must contain 4–12 numbers.</p>
          {pinMessage ? <p className={`form-message form-message--${pinMessage.kind}`} role={pinMessage.kind === "error" ? "alert" : "status"}>{pinMessage.text}</p> : null}
          <button type="submit" className="button button--primary" disabled={!canChangePin || changingPin}>
            {changingPin ? "Changing…" : "Change PIN"}
          </button>
        </form>
      </section>

      <section className="security-section security-section--emergency">
        <div className="security-section__heading security-section__heading--mint">
          <Unlock aria-hidden="true" />
          <h2>Emergency unlock</h2>
          <ChevronUp aria-hidden="true" />
        </div>
        <div className="emergency-settings">
          <div className="emergency-row">
            <span>Enable emergency unlock</span>
            <Switch
              label="Enable emergency unlock"
              checked={emergency.enabled}
              onChange={(enabled) => requestEmergencyChange({ ...emergency, enabled })}
            />
          </div>
          <label className="emergency-row" htmlFor="emergency-shortcut">
            <span>Shortcut</span>
            <select
              id="emergency-shortcut"
              value={shortcutLabel}
              disabled={!emergency.enabled}
              onChange={(event) => requestEmergencyChange({ enabled: true, shortcut: event.target.value })}
            >
              {shortcutOptions.map((shortcut) => <option key={shortcut}>{shortcut}</option>)}
            </select>
          </label>
          <div className="warning-card">
            <TriangleAlert aria-hidden="true" />
            <p>Emergency unlock removes the cover without asking for your PIN. Anyone who knows the shortcut can use it.</p>
          </div>
          <p className="security-form__hint">The shortcut is registered only while the cover is active and this setting is enabled.</p>
        </div>
      </section>

      {pendingEmergency ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeEmergencyDialog();
        }}>
          <div
            ref={dialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emergency-dialog-title"
            aria-describedby="emergency-dialog-description"
            tabIndex={-1}
          >
            <Unlock aria-hidden="true" className="modal__icon" />
            <h2 id="emergency-dialog-title">Confirm with your PIN</h2>
            <p id="emergency-dialog-description">{pendingEmergency.enabled ? "This shortcut can bypass the cover." : "Disable the emergency unlock shortcut."}</p>
            <form onSubmit={(event) => void submitEmergency(event)}>
              <PinInput id="emergency-current-pin" label="Current PIN" value={emergencyPin} onChange={setEmergencyPin} autoFocus />
              {emergencyError ? <div className="form-error" role="alert">{emergencyError}</div> : null}
              <div className="modal__actions">
                <button type="button" className="button button--secondary" onClick={closeEmergencyDialog}>Cancel</button>
                <button type="submit" className="button button--primary" disabled={!isNumericPin(emergencyPin) || savingEmergency}>{savingEmergency ? "Saving…" : "Confirm"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
