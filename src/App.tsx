import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { getCoverWindowContext, getNativeClient } from "./lib/native";
import { DEFAULT_SETTINGS, type BootstrapDto, type CoverLifecycle, type PublicSettings } from "./types";
import { CoverScreen } from "./features/cover/CoverScreen";
import { Onboarding } from "./features/onboarding/Onboarding";
import { CorruptConfiguration } from "./features/recovery/CorruptConfiguration";
import { AppShell, type MainSection } from "./features/settings/AppShell";
import { AboutScreen } from "./features/settings/AboutScreen";
import { AppearanceScreen } from "./features/settings/AppearanceScreen";
import { BehaviorScreen } from "./features/settings/BehaviorScreen";
import { ControlScreen } from "./features/settings/ControlScreen";
import { SecurityScreen } from "./features/settings/SecurityScreen";

const validSections = new Set<MainSection>(["control", "appearance", "behavior", "security", "about"]);

function initialSection(): MainSection {
  const section = new URLSearchParams(window.location.search).get("section") as MainSection | null;
  return section && validSections.has(section) ? section : "control";
}

export default function App() {
  const native = useMemo(() => getNativeClient(), []);
  const context = useMemo(() => getCoverWindowContext(), []);
  const [bootstrap, setBootstrap] = useState<BootstrapDto | null>(null);
  const [section, setSection] = useState<MainSection>(initialSection);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [recoveryNoticeDismissed, setRecoveryNoticeDismissed] = useState(false);

  const loadBootstrap = useCallback(async () => {
    setLoadError("");
    try {
      setBootstrap(await native.getBootstrap());
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [native]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    setRecoveryNoticeDismissed(false);
  }, [bootstrap?.configStatus]);

  useEffect(() => {
    let disposed = false;
    const unsubscribers: Array<() => void> = [];

    const add = async (promise: Promise<() => void>) => {
      const unsubscribe = await promise;
      if (disposed) unsubscribe();
      else unsubscribers.push(unsubscribe);
    };

    void add(native.on("visualcover://state", (payload) => {
      const lifecycle: CoverLifecycle = typeof payload === "string" ? payload : payload.lifecycle;
      setBootstrap((current) => current ? { ...current, lifecycle } : current);
    }));
    void add(native.on("visualcover://settings", (settings) => {
      setBootstrap((current) => current ? { ...current, settings } : current);
    }));
    void add(native.on("visualcover://config-warning", (warning) => {
      setNotice(typeof warning === "string" ? warning : warning.message);
    }));
    void add(native.on("visualcover://open-about", () => setSection("about")));

    return () => {
      disposed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [context.isCover, native]);

  const completeSetup = async (pin: string, settings: PublicSettings) => {
    await native.completeSetup(pin, settings);
    setBootstrap((current) => ({
      version: current?.version ?? "0.1.0",
      platform: current?.platform ?? "macos",
      setupRequired: false,
      lifecycle: "uncovered",
      settings,
      autostartEnabled: settings.launchAtLogin,
      idleSupported: current?.idleSupported ?? false,
      configStatus: "ok",
    }));
  };

  const updateSettings = async (settings: PublicSettings) => {
    const previous = bootstrap?.settings;
    const previousAutostartEnabled = bootstrap?.autostartEnabled ?? false;
    setBootstrap((current) => current ? { ...current, settings, autostartEnabled: settings.launchAtLogin } : current);
    try {
      await native.updatePreferences(settings);
    } catch (cause) {
      setBootstrap((current) => current && previous ? {
        ...current,
        settings: previous,
        autostartEnabled: previousAutostartEnabled,
      } : current);
      setNotice(cause instanceof Error ? cause.message : "Settings could not be saved.");
    }
  };

  if (!bootstrap) {
    return (
      <main className="loading-screen">
        <div className="loading-mark" />
        {loadError ? (
          <><p role="alert">{loadError}</p><button type="button" className="button button--secondary" onClick={() => void loadBootstrap()}>Try again</button></>
        ) : <p>Opening VisualCover…</p>}
      </main>
    );
  }

  if (bootstrap.configStatus === "corrupt") {
    return <CorruptConfiguration onRetry={loadBootstrap} onReset={async (confirmation) => {
      await native.resetCorruptConfiguration(confirmation);
      await loadBootstrap();
    }} />;
  }

  const storedSettings = bootstrap.settings ?? DEFAULT_SETTINGS;
  const settings: PublicSettings = {
    ...storedSettings,
    launchAtLogin: bootstrap.autostartEnabled,
    coverAfterLaunch: bootstrap.autostartEnabled && storedSettings.coverAfterLaunch,
  };

  if (context.isCover) {
    return <CoverScreen settings={settings} context={context} />;
  }

  if (bootstrap.setupRequired) {
    return <Onboarding initialSettings={settings} onComplete={completeSetup} />;
  }

  const screen = (() => {
    switch (section) {
      case "appearance":
        return <AppearanceScreen settings={settings} onSettingsChange={updateSettings} />;
      case "behavior":
        return <BehaviorScreen settings={settings} idleSupported={bootstrap.idleSupported} onSettingsChange={updateSettings} />;
      case "security":
        return <SecurityScreen settings={settings} onChangePin={native.changePin} onConfigureEmergencyUnlock={native.configureEmergencyUnlock} />;
      case "about":
        return <AboutScreen version={bootstrap.version} lifecycle={bootstrap.lifecycle} />;
      case "control":
      default:
        return <ControlScreen version={bootstrap.version} lifecycle={bootstrap.lifecycle} settings={settings} onActivate={native.activateCover} onSettingsChange={updateSettings} />;
    }
  })();

  return (
    <>
      <AppShell active={section} lifecycle={bootstrap.lifecycle} onNavigate={(next) => {
        if (bootstrap.lifecycle === "uncovered" || next === "about") setSection(next);
      }}>
        {screen}
      </AppShell>
      {notice || (bootstrap.configStatus === "recovered-from-backup" && !recoveryNoticeDismissed) ? (
        <div className="toast" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>{notice || "Settings were restored from the last valid backup."}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => {
              if (notice) setNotice("");
              else setRecoveryNoticeDismissed(true);
            }}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
