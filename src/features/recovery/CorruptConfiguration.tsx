import { useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { BrandMark } from "../../components/BrandMark";
import { WindowChrome } from "../../components/WindowChrome";

type CorruptConfigurationProps = {
  onRetry: () => Promise<void>;
  onReset: (confirmation: string) => Promise<void>;
};

export function CorruptConfiguration({ onRetry, onReset }: CorruptConfigurationProps) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="recovery-screen">
      <WindowChrome />
      <BrandMark compact />
      <div className="recovery-card">
        <TriangleAlert aria-hidden="true" />
        <h1>VisualCover needs your attention</h1>
        <p>Your settings and backup could not be read. Automatic covering is disabled so you cannot be locked behind an unknown PIN.</p>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void run(onRetry)}>
          <RefreshCw aria-hidden="true" />Retry
        </button>
        <div className="recovery-reset">
          <h2>Reset configuration</h2>
          <p>This removes the unreadable local settings and returns to first-run setup. Type <strong>RESET</strong> to continue.</p>
          <input aria-label="Reset confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          <button type="button" className="button button--danger" disabled={busy || confirmation !== "RESET"} onClick={() => void run(() => onReset(confirmation))}>Reset VisualCover</button>
        </div>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </div>
    </main>
  );
}
