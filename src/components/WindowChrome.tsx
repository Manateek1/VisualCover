import { Minus, Square, X } from "lucide-react";
import { getNativeClient } from "../lib/native";

export function WindowChrome() {
  const native = getNativeClient();

  return (
    <div className="window-chrome" data-tauri-drag-region aria-label="Window controls">
      <button
        type="button"
        className="window-chrome__button"
        aria-label="Minimize"
        onClick={() => void native.minimizeWindow()}
      >
        <Minus aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-chrome__button"
        aria-label="Maximize"
        onClick={() => void native.toggleMaximizeWindow()}
      >
        <Square aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-chrome__button window-chrome__button--close"
        aria-label="Close"
        onClick={() => void native.closeWindow()}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
