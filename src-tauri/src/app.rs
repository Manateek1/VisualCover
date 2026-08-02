use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
    time::{Duration, Instant},
};

use tauri::{
    App, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent, menu::MenuBuilder, tray::TrayIconBuilder,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt as _, ShortcutState};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    model::{
        BootstrapDto, ConfigStatus, ConfigWarning, CoverLifecycle, EmergencyUnlockConfig, Platform,
        PublicSettings, StoredConfig, validate_emergency_shortcut, validate_pin,
    },
    persistence::{ConfigStore, LoadOutcome},
    security::{hash_pin, verify_pin},
};

const TRAY_ID: &str = "visualcover-tray";
const TRAY_ACTIVATE: &str = "activate-cover";
const TRAY_OPEN: &str = "open-settings";
const TRAY_ABOUT: &str = "about";
const TRAY_QUIT: &str = "quit";
const PENDING_READY_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingAction {
    OpenSettings,
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UnlockReason {
    Authenticated,
    Emergency,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Access {
    Main,
    MainOrCover,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SingleInstanceAction {
    FocusMain,
    RepairCovers,
}

#[derive(Debug, Clone)]
struct MonitorSnapshot {
    name: Option<String>,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    scale_factor: f64,
    primary: bool,
}

impl PartialEq for MonitorSnapshot {
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name
            && self.position == other.position
            && self.size == other.size
            && self.scale_factor.to_bits() == other.scale_factor.to_bits()
            && self.primary == other.primary
    }
}

impl Eq for MonitorSnapshot {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CoverRole {
    Primary,
    Secondary,
}

impl CoverRole {
    const fn query_value(self) -> &'static str {
        match self {
            Self::Primary => "primary",
            Self::Secondary => "secondary",
        }
    }
}

#[derive(Debug, Clone)]
struct CoverWindowSpec {
    label: String,
    monitor: MonitorSnapshot,
    role: CoverRole,
    index: usize,
}

#[derive(Debug, Clone)]
struct CoverGeneration {
    session_id: String,
    windows: Vec<CoverWindowSpec>,
    ready: HashSet<String>,
    created_at: Instant,
}

impl CoverGeneration {
    fn all_ready(&self) -> bool {
        !self.windows.is_empty() && self.ready.len() == self.windows.len()
    }

    fn primary(&self) -> Option<&CoverWindowSpec> {
        self.windows
            .iter()
            .find(|window| window.role == CoverRole::Primary)
    }

    fn topology(&self) -> Vec<MonitorSnapshot> {
        self.windows
            .iter()
            .map(|window| window.monitor.clone())
            .collect()
    }
}

#[derive(Debug)]
struct RuntimeState {
    config: Option<StoredConfig>,
    config_status: ConfigStatus,
    lifecycle: CoverLifecycle,
    active: Option<CoverGeneration>,
    pending: Option<CoverGeneration>,
    pending_action: Option<PendingAction>,
    registered_shortcut: Option<String>,
}

impl RuntimeState {
    fn new(config: Option<StoredConfig>, config_status: ConfigStatus) -> Self {
        Self {
            config,
            config_status,
            lifecycle: CoverLifecycle::Uncovered,
            active: None,
            pending: None,
            pending_action: None,
            registered_shortcut: None,
        }
    }

    fn queue_action(&mut self, action: PendingAction) {
        if self.pending_action != Some(PendingAction::Quit) {
            self.pending_action = Some(action);
        }
    }

    fn begin_initial_cover(&mut self) -> AppResult<bool> {
        if self.config_status == ConfigStatus::Corrupt {
            return Err(AppError::ConfigCorrupt);
        }
        if self.config.is_none() {
            return Err(AppError::SetupIncomplete);
        }
        match self.lifecycle {
            CoverLifecycle::Uncovered => {
                self.lifecycle = CoverLifecycle::Covering;
                Ok(true)
            }
            CoverLifecycle::Covering | CoverLifecycle::Covered => Ok(false),
            CoverLifecycle::Uncovering => Err(AppError::Busy),
        }
    }

    fn abort_pending(&mut self, session_id: &str) -> bool {
        if self
            .pending
            .as_ref()
            .is_some_and(|pending| pending.session_id == session_id)
        {
            self.pending = None;
            if self.active.is_none() {
                self.lifecycle = CoverLifecycle::Uncovered;
                self.pending_action = None;
                return true;
            }
            self.lifecycle = CoverLifecycle::Covered;
        }
        false
    }

    fn single_instance_action(&self) -> SingleInstanceAction {
        if self.lifecycle == CoverLifecycle::Uncovered {
            SingleInstanceAction::FocusMain
        } else {
            SingleInstanceAction::RepairCovers
        }
    }
}

pub struct AppState {
    store: ConfigStore,
    inner: Mutex<RuntimeState>,
    mutation_gate: AsyncMutex<()>,
}

impl AppState {
    fn new(store: ConfigStore, config: Option<StoredConfig>, status: ConfigStatus) -> Self {
        Self {
            store,
            inner: Mutex::new(RuntimeState::new(config, status)),
            mutation_gate: AsyncMutex::new(()),
        }
    }
}

fn lock_runtime(state: &AppState) -> AppResult<MutexGuard<'_, RuntimeState>> {
    state
        .inner
        .lock()
        .map_err(|_| AppError::Native("application state lock was poisoned".into()))
}

fn authorize(label: &str, access: Access) -> AppResult<()> {
    let allowed = match access {
        Access::Main => label == "main",
        Access::MainOrCover => label == "main" || label.starts_with("cover-"),
    };
    allowed.then_some(()).ok_or(AppError::Unauthorized)
}

fn is_protected(lifecycle: CoverLifecycle) -> bool {
    lifecycle != CoverLifecycle::Uncovered
}

#[cfg(any(target_os = "windows", test))]
fn idle_should_cover(elapsed_millis: u64, idle_minutes: Option<u8>) -> bool {
    idle_minutes.is_some_and(|minutes| elapsed_millis >= u64::from(minutes) * 60_000)
}

fn emit_lifecycle(app: &AppHandle, lifecycle: CoverLifecycle) {
    let _ = app.emit("visualcover://state", lifecycle);
    let _ = refresh_tray_menu(app);
}

fn emit_settings(app: &AppHandle, settings: &PublicSettings) {
    let _ = app.emit("visualcover://settings", settings.clone());
}

fn emit_warning(app: &AppHandle, message: impl Into<String>, status: ConfigStatus) {
    let _ = app.emit(
        "visualcover://config-warning",
        ConfigWarning {
            message: message.into(),
            status,
        },
    );
}

async fn hash_pin_async(pin: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || hash_pin(&pin))
        .await
        .map_err(|error| AppError::Native(error.to_string()))?
}

async fn verify_pin_async(pin_hash: String, candidate: String) -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(move || verify_pin(&pin_hash, &candidate))
        .await
        .map_err(|error| AppError::Native(error.to_string()))
}

async fn save_config_async(store: ConfigStore, config: StoredConfig) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || store.save(&config))
        .await
        .map_err(|error| AppError::Native(error.to_string()))?
}

fn autostart_enabled(app: &AppHandle) -> AppResult<bool> {
    match app.autolaunch().is_enabled() {
        Ok(enabled) => Ok(enabled),
        Err(_) => Ok(false),
    }
}

fn set_autostart(app: &AppHandle, enabled: bool) -> AppResult<()> {
    if enabled {
        app.autolaunch()
            .enable()
            .map_err(|error| AppError::Native(error.to_string()))
    } else {
        match app.autolaunch().disable() {
            Ok(()) => Ok(()),
            Err(error) => {
                let msg = error.to_string();
                if msg.contains("cannot find")
                    || msg.contains("os error 2")
                    || msg.contains("NotFound")
                {
                    Ok(())
                } else {
                    Err(AppError::Native(msg))
                }
            }
        }
    }
}

#[tauri::command]
pub async fn get_bootstrap(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<BootstrapDto> {
    authorize(window.label(), Access::MainOrCover)?;

    // A Retry action can call this command after the user has repaired the files externally.
    let should_retry = lock_runtime(&state)?.config_status == ConfigStatus::Corrupt;
    if should_retry {
        match state.store.load() {
            LoadOutcome::Missing => {
                let mut runtime = lock_runtime(&state)?;
                runtime.config = None;
                runtime.config_status = ConfigStatus::Ok;
            }
            LoadOutcome::Loaded { config, status } => {
                let mut runtime = lock_runtime(&state)?;
                runtime.config = Some(config);
                runtime.config_status = status;
            }
            LoadOutcome::Corrupt => {}
        }
    }

    let autostart_enabled = autostart_enabled(&app)?;
    let runtime = lock_runtime(&state)?;
    Ok(BootstrapDto {
        version: env!("CARGO_PKG_VERSION").into(),
        platform: Platform::current(),
        setup_required: runtime.config.is_none() && runtime.config_status != ConfigStatus::Corrupt,
        lifecycle: runtime.lifecycle,
        settings: runtime
            .config
            .as_ref()
            .map(|config| config.settings.clone()),
        autostart_enabled,
        idle_supported: cfg!(target_os = "windows"),
        config_status: runtime.config_status,
    })
}

#[tauri::command]
pub async fn complete_setup(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    pin: String,
    settings: PublicSettings,
) -> AppResult<()> {
    authorize(window.label(), Access::Main)?;
    validate_pin(&pin)?;
    settings.validate()?;
    if settings.emergency_unlock != PublicSettings::default().emergency_unlock {
        return Err(AppError::InvalidInput(
            "Emergency unlock must be configured after setup with the current PIN.".into(),
        ));
    }

    let _mutation = state.mutation_gate.lock().await;
    {
        let runtime = lock_runtime(&state)?;
        if runtime.config_status == ConfigStatus::Corrupt {
            return Err(AppError::ConfigCorrupt);
        }
        if runtime.config.is_some() {
            return Err(AppError::InvalidInput(
                "VisualCover setup has already been completed.".into(),
            ));
        }
    }

    let pin_hash = hash_pin_async(pin).await?;
    let config = StoredConfig::new(pin_hash, settings.clone());
    let previous_autostart = autostart_enabled(&app)?;
    set_autostart(&app, settings.launch_at_login)?;
    if let Err(error) = save_config_async(state.store.clone(), config.clone()).await {
        let _ = set_autostart(&app, previous_autostart);
        return Err(error);
    }

    {
        let mut runtime = lock_runtime(&state)?;
        runtime.config = Some(config);
        runtime.config_status = ConfigStatus::Ok;
        runtime.lifecycle = CoverLifecycle::Uncovered;
    }
    emit_settings(&app, &settings);
    emit_lifecycle(&app, CoverLifecycle::Uncovered);
    show_main_window(&app, false)?;
    Ok(())
}

#[tauri::command]
pub async fn update_preferences(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    settings: PublicSettings,
) -> AppResult<()> {
    authorize(window.label(), Access::Main)?;
    settings.validate()?;
    let _mutation = state.mutation_gate.lock().await;
    let existing = {
        let runtime = lock_runtime(&state)?;
        if runtime.config_status == ConfigStatus::Corrupt {
            return Err(AppError::ConfigCorrupt);
        }
        runtime.config.clone().ok_or(AppError::SetupIncomplete)?
    };
    if settings.emergency_unlock != existing.settings.emergency_unlock {
        return Err(AppError::InvalidInput(
            "Use the authenticated emergency-unlock control to change that setting.".into(),
        ));
    }

    let mut updated = existing;
    updated.settings = settings.clone();
    let previous_autostart = autostart_enabled(&app)?;
    set_autostart(&app, settings.launch_at_login)?;
    if let Err(error) = save_config_async(state.store.clone(), updated.clone()).await {
        let _ = set_autostart(&app, previous_autostart);
        return Err(error);
    }
    lock_runtime(&state)?.config = Some(updated);
    emit_settings(&app, &settings);
    Ok(())
}

#[tauri::command]
pub async fn change_pin(
    window: WebviewWindow,
    state: State<'_, AppState>,
    current_pin: String,
    new_pin: String,
) -> AppResult<()> {
    authorize(window.label(), Access::Main)?;
    validate_pin(&new_pin)?;
    let _mutation = state.mutation_gate.lock().await;
    let existing = {
        let runtime = lock_runtime(&state)?;
        if runtime.config_status == ConfigStatus::Corrupt {
            return Err(AppError::ConfigCorrupt);
        }
        runtime.config.clone().ok_or(AppError::SetupIncomplete)?
    };
    if !verify_pin_async(existing.pin_hash.clone(), current_pin).await? {
        return Err(AppError::IncorrectPin);
    }

    let mut updated = existing;
    updated.pin_hash = hash_pin_async(new_pin).await?;
    save_config_async(state.store.clone(), updated.clone()).await?;
    lock_runtime(&state)?.config = Some(updated);
    Ok(())
}

#[tauri::command]
pub async fn configure_emergency_unlock(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    current_pin: String,
    config: EmergencyUnlockConfig,
) -> AppResult<()> {
    authorize(window.label(), Access::Main)?;
    validate_emergency_shortcut(&config.shortcut)?;
    let _mutation = state.mutation_gate.lock().await;
    let existing = {
        let runtime = lock_runtime(&state)?;
        if runtime.config_status == ConfigStatus::Corrupt {
            return Err(AppError::ConfigCorrupt);
        }
        runtime.config.clone().ok_or(AppError::SetupIncomplete)?
    };
    if !verify_pin_async(existing.pin_hash.clone(), current_pin).await? {
        return Err(AppError::IncorrectPin);
    }

    let protected = is_protected(lock_runtime(&state)?.lifecycle);
    let old_registration = if protected && existing.settings.emergency_unlock.enabled {
        Some(existing.settings.emergency_unlock.shortcut.clone())
    } else {
        None
    };
    let new_registration = if protected && config.enabled {
        Some(config.shortcut.clone())
    } else {
        None
    };
    set_registered_shortcut(&app, new_registration.as_deref())?;

    let mut updated = existing;
    updated.settings.emergency_unlock = config;
    if let Err(error) = save_config_async(state.store.clone(), updated.clone()).await {
        let _ = set_registered_shortcut(&app, old_registration.as_deref());
        return Err(error);
    }
    let settings = updated.settings.clone();
    lock_runtime(&state)?.config = Some(updated);
    emit_settings(&app, &settings);
    Ok(())
}

#[tauri::command]
pub async fn activate_cover(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    authorize(window.label(), Access::Main)?;
    let _mutation = state.mutation_gate.lock().await;
    begin_cover(&app, true).await
}

#[tauri::command]
pub async fn cover_window_ready(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<()> {
    authorize(window.label(), Access::MainOrCover)?;
    if !window.label().starts_with("cover-") {
        return Err(AppError::Unauthorized);
    }
    let _mutation = state.mutation_gate.lock().await;
    let should_promote = {
        let mut runtime = lock_runtime(&state)?;
        let Some(pending) = runtime.pending.as_mut() else {
            let already_active = runtime.lifecycle == CoverLifecycle::Covered
                && runtime.active.as_ref().is_some_and(|active| {
                    active.session_id == session_id
                        && active
                            .windows
                            .iter()
                            .any(|candidate| candidate.label == window.label())
                });
            return already_active.then_some(()).ok_or(AppError::Unauthorized);
        };
        if pending.session_id != session_id
            || !pending
                .windows
                .iter()
                .any(|candidate| candidate.label == window.label())
        {
            return Err(AppError::Unauthorized);
        }
        pending.ready.insert(window.label().to_owned());
        pending.all_ready()
    };
    if should_promote {
        promote_pending_generation(&app, &session_id).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn unlock(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    pin: String,
) -> AppResult<bool> {
    let _mutation = state.mutation_gate.lock().await;
    let pin_hash = {
        let runtime = lock_runtime(&state)?;
        let active = runtime.active.as_ref().ok_or(AppError::Unauthorized)?;
        let primary = active.primary().ok_or(AppError::Unauthorized)?;
        if primary.label != window.label() || runtime.lifecycle != CoverLifecycle::Covered {
            return Err(AppError::Unauthorized);
        }
        runtime
            .config
            .as_ref()
            .ok_or(AppError::SetupIncomplete)?
            .pin_hash
            .clone()
    };
    if !verify_pin_async(pin_hash, pin).await? {
        return Ok(false);
    }
    uncover(&app, UnlockReason::Authenticated).await?;
    Ok(true)
}

#[tauri::command]
pub async fn request_quit(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    authorize(window.label(), Access::Main)?;
    let _mutation = state.mutation_gate.lock().await;
    request_quit_internal(&app)
}

#[tauri::command]
pub async fn reset_corrupt_configuration(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    confirmation: String,
) -> AppResult<()> {
    authorize(window.label(), Access::Main)?;
    if confirmation != "RESET" {
        return Err(AppError::InvalidInput("Type RESET to confirm.".into()));
    }
    let _mutation = state.mutation_gate.lock().await;
    if is_protected(lock_runtime(&state)?.lifecycle) {
        return Err(AppError::Busy);
    }
    state.store.reset()?;
    set_autostart(&app, false)?;
    {
        let mut runtime = lock_runtime(&state)?;
        runtime.config = None;
        runtime.config_status = ConfigStatus::Ok;
        runtime.pending_action = None;
    }
    emit_lifecycle(&app, CoverLifecycle::Uncovered);
    show_main_window(&app, false)
}

fn discover_monitors(app: &AppHandle) -> AppResult<Vec<MonitorSnapshot>> {
    let monitors = app
        .available_monitors()
        .map_err(|error| AppError::Native(error.to_string()))?;
    let primary = app
        .primary_monitor()
        .map_err(|error| AppError::Native(error.to_string()))?;

    let mut snapshots: Vec<_> = monitors
        .into_iter()
        .map(|monitor| {
            let is_primary = primary.as_ref().is_some_and(|candidate| {
                candidate.position() == monitor.position()
                    && candidate.size() == monitor.size()
                    && candidate.scale_factor().to_bits() == monitor.scale_factor().to_bits()
                    && candidate.name() == monitor.name()
            });
            MonitorSnapshot {
                name: monitor.name().cloned(),
                position: *monitor.position(),
                size: *monitor.size(),
                scale_factor: monitor.scale_factor(),
                primary: is_primary,
            }
        })
        .collect();

    if snapshots.is_empty() {
        return Err(AppError::Native("No connected displays were found.".into()));
    }
    let mut primary_assigned = false;
    for monitor in &mut snapshots {
        if monitor.primary && !primary_assigned {
            primary_assigned = true;
        } else {
            monitor.primary = false;
        }
    }
    if !primary_assigned {
        snapshots[0].primary = true;
    }
    snapshots.sort_by(|left, right| {
        (!left.primary)
            .cmp(&(!right.primary))
            .then_with(|| left.position.y.cmp(&right.position.y))
            .then_with(|| left.position.x.cmp(&right.position.x))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(snapshots)
}

async fn begin_cover(app: &AppHandle, initial: bool) -> AppResult<()> {
    let state = app.state::<AppState>();
    if initial {
        let should_begin = lock_runtime(&state)?.begin_initial_cover()?;
        if !should_begin {
            return Ok(());
        }
        emit_lifecycle(app, CoverLifecycle::Covering);
    } else {
        let runtime = lock_runtime(&state)?;
        if runtime.lifecycle != CoverLifecycle::Covered || runtime.pending.is_some() {
            return Ok(());
        }
    }

    let monitors = match discover_monitors(app) {
        Ok(monitors) => monitors,
        Err(error) => {
            if initial {
                lock_runtime(&state)?.lifecycle = CoverLifecycle::Uncovered;
                emit_lifecycle(app, CoverLifecycle::Uncovered);
            }
            return Err(error);
        }
    };
    let session_id = Uuid::new_v4().to_string();
    let windows = monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| CoverWindowSpec {
            label: format!("cover-{session_id}-{index}"),
            role: if monitor.primary {
                CoverRole::Primary
            } else {
                CoverRole::Secondary
            },
            monitor,
            index,
        })
        .collect::<Vec<_>>();
    let generation = CoverGeneration {
        session_id: session_id.clone(),
        windows: windows.clone(),
        ready: HashSet::new(),
        created_at: Instant::now(),
    };

    {
        let mut runtime = lock_runtime(&state)?;
        if runtime.pending.is_some()
            || (initial && runtime.lifecycle != CoverLifecycle::Covering)
            || (!initial && runtime.lifecycle != CoverLifecycle::Covered)
        {
            return Ok(());
        }
        runtime.pending = Some(generation);
    }

    let generation_labels = windows
        .iter()
        .map(|window| window.label.clone())
        .collect::<Vec<_>>();
    for spec in &windows {
        match build_cover_window(app, &session_id, spec) {
            Ok(()) => {}
            Err(error) => {
                destroy_windows(app, &generation_labels);
                let returned_to_uncovered = lock_runtime(&state)?.abort_pending(&session_id);
                if returned_to_uncovered {
                    emit_lifecycle(app, CoverLifecycle::Uncovered);
                }
                return Err(error);
            }
        }
    }
    Ok(())
}

fn build_cover_window(app: &AppHandle, session_id: &str, spec: &CoverWindowSpec) -> AppResult<()> {
    let url = PathBuf::from(format!(
        "index.html?surface=cover&role={}&session={session_id}&index={}",
        spec.role.query_value(),
        spec.index
    ));
    let window = WebviewWindowBuilder::new(app, &spec.label, WebviewUrl::App(url))
        .title("VisualCover")
        .visible(false)
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .focusable(spec.role == CoverRole::Primary)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .build()
        .map_err(|error| AppError::Native(error.to_string()))?;

    apply_cover_geometry(&window, &spec.monitor)?;
    apply_platform_styles(&window)?;
    let close_guard = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = close_guard.set_always_on_top(true);
        }
    });
    Ok(())
}

fn apply_cover_geometry(window: &WebviewWindow, monitor: &MonitorSnapshot) -> AppResult<()> {
    window
        .set_position(monitor.position)
        .and_then(|()| window.set_size(monitor.size))
        .and_then(|()| window.set_resizable(false))
        .and_then(|()| window.set_minimizable(false))
        .and_then(|()| window.set_closable(false))
        .and_then(|()| window.set_skip_taskbar(true))
        .and_then(|()| window.set_always_on_top(true))
        .map_err(|error| AppError::Native(error.to_string()))
}

#[cfg(target_os = "windows")]
fn apply_platform_styles(window: &WebviewWindow) -> AppResult<()> {
    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{
            GWL_EXSTYLE, GetWindowLongPtrW, SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
            SetWindowLongPtrW, SetWindowPos, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        },
    };

    let tauri_hwnd = window
        .hwnd()
        .map_err(|error| AppError::Native(error.to_string()))?;
    let hwnd = HWND(tauri_hwnd.0);
    unsafe {
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let updated = (current | WS_EX_TOOLWINDOW.0 as isize) & !(WS_EX_APPWINDOW.0 as isize);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, updated);
        SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        )
        .map_err(|error| AppError::Native(error.to_string()))?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn apply_platform_styles(_window: &WebviewWindow) -> AppResult<()> {
    Ok(())
}

async fn promote_pending_generation(app: &AppHandle, session_id: &str) -> AppResult<()> {
    let state = app.state::<AppState>();
    let (pending, old_labels, compatibility_mode, shortcut, initial_activation) = {
        let runtime = lock_runtime(&state)?;
        let pending = runtime
            .pending
            .as_ref()
            .filter(|generation| generation.session_id == session_id && generation.all_ready())
            .cloned()
            .ok_or(AppError::Unauthorized)?;
        let old_labels = runtime
            .active
            .as_ref()
            .map(|generation| {
                generation
                    .windows
                    .iter()
                    .map(|window| window.label.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let config = runtime.config.as_ref().ok_or(AppError::SetupIncomplete)?;
        let shortcut = config
            .settings
            .emergency_unlock
            .enabled
            .then(|| config.settings.emergency_unlock.shortcut.clone());
        (
            pending,
            old_labels,
            config.settings.compatibility_mode,
            shortcut,
            runtime.lifecycle == CoverLifecycle::Covering,
        )
    };

    let mut shown = Vec::new();
    let pending_labels = pending
        .windows
        .iter()
        .map(|window| window.label.clone())
        .collect::<Vec<_>>();
    for spec in &pending.windows {
        let Some(window) = app.get_webview_window(&spec.label) else {
            destroy_windows(app, &pending_labels);
            let returned = lock_runtime(&state)?.abort_pending(session_id);
            if returned {
                emit_lifecycle(app, CoverLifecycle::Uncovered);
            }
            return Err(AppError::Native(
                "A cover window disappeared before activation.".into(),
            ));
        };
        if let Err(error) = apply_cover_geometry(&window, &spec.monitor).and_then(|()| {
            window
                .show()
                .map_err(|native| AppError::Native(native.to_string()))
        }) {
            destroy_windows(app, &pending_labels);
            let returned = lock_runtime(&state)?.abort_pending(session_id);
            if returned {
                emit_lifecycle(app, CoverLifecycle::Uncovered);
            }
            return Err(error);
        }
        shown.push(spec.label.clone());
    }

    let promoted = {
        let mut runtime = lock_runtime(&state)?;
        if runtime
            .pending
            .as_ref()
            .is_some_and(|generation| generation.session_id == session_id)
        {
            runtime.active = runtime.pending.take();
            runtime.lifecycle = CoverLifecycle::Covered;
            true
        } else {
            false
        }
    };
    if !promoted {
        destroy_windows(app, &shown);
        return Ok(());
    }

    if initial_activation && let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
        let _ = main.set_always_on_top(false);
    }
    destroy_windows(app, &old_labels);
    if initial_activation
        && !compatibility_mode
        && let Some(primary) = pending.primary()
        && let Some(window) = app.get_webview_window(&primary.label)
    {
        let _ = window.set_focus();
    }
    if let Err(error) = set_registered_shortcut(app, shortcut.as_deref()) {
        emit_warning(
            app,
            format!("The emergency shortcut could not be registered: {error}"),
            lock_runtime(&state)?.config_status,
        );
    }
    emit_lifecycle(app, CoverLifecycle::Covered);
    if lock_runtime(&state)?.pending_action.is_some()
        && let Err(error) = reveal_primary(app)
    {
        emit_warning(
            app,
            format!(
                "The queued tray action is waiting for authentication, but the PIN prompt could not be revealed: {error}"
            ),
            lock_runtime(&state)?.config_status,
        );
    }
    Ok(())
}

fn set_registered_shortcut(app: &AppHandle, desired: Option<&str>) -> AppResult<()> {
    let state = app.state::<AppState>();
    let current = lock_runtime(&state)?.registered_shortcut.clone();
    if current.as_deref() == desired {
        return Ok(());
    }

    if let Some(current) = current.as_deref() {
        app.global_shortcut()
            .unregister(current)
            .map_err(|error| AppError::Native(error.to_string()))?;
    }
    if let Some(desired) = desired
        && let Err(error) = app.global_shortcut().register(desired)
    {
        if let Some(current) = current.as_deref() {
            let _ = app.global_shortcut().register(current);
        }
        return Err(AppError::Native(error.to_string()));
    }
    lock_runtime(&state)?.registered_shortcut = desired.map(str::to_owned);
    Ok(())
}

async fn uncover(app: &AppHandle, reason: UnlockReason) -> AppResult<()> {
    let state = app.state::<AppState>();
    let (labels, action) = {
        let mut runtime = lock_runtime(&state)?;
        if runtime.lifecycle == CoverLifecycle::Uncovered {
            return Ok(());
        }
        runtime.lifecycle = CoverLifecycle::Uncovering;
        let mut labels = Vec::new();
        for generation in [runtime.active.take(), runtime.pending.take()]
            .into_iter()
            .flatten()
        {
            labels.extend(generation.windows.into_iter().map(|window| window.label));
        }
        let action = match reason {
            UnlockReason::Authenticated => runtime.pending_action.take(),
            UnlockReason::Emergency => {
                runtime.pending_action = None;
                None
            }
        };
        (labels, action)
    };
    emit_lifecycle(app, CoverLifecycle::Uncovering);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
        let _ = main.set_always_on_top(false);
    }
    if let Err(error) = set_registered_shortcut(app, None) {
        emit_warning(
            app,
            format!("The emergency shortcut could not be unregistered: {error}"),
            lock_runtime(&state)?.config_status,
        );
    }
    destroy_windows(app, &labels);
    lock_runtime(&state)?.lifecycle = CoverLifecycle::Uncovered;
    emit_lifecycle(app, CoverLifecycle::Uncovered);

    match action {
        Some(PendingAction::OpenSettings) => show_main_window(app, false)?,
        Some(PendingAction::Quit) => app.exit(0),
        None => {}
    }
    Ok(())
}

fn destroy_windows(app: &AppHandle, labels: &[String]) {
    for label in labels {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

fn reveal_primary(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let (label, compatibility_mode) = {
        let runtime = lock_runtime(&state)?;
        let primary = runtime
            .active
            .as_ref()
            .and_then(CoverGeneration::primary)
            .ok_or(AppError::Busy)?;
        let compatibility_mode = runtime
            .config
            .as_ref()
            .is_none_or(|config| config.settings.compatibility_mode);
        (primary.label.clone(), compatibility_mode)
    };
    app.emit_to(&label, "visualcover://reveal-pin", ())
        .map_err(|error| AppError::Native(error.to_string()))?;
    if !compatibility_mode && let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_focus();
    }
    Ok(())
}

fn show_main_window(app: &AppHandle, above_cover: bool) -> AppResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Native("Main window is unavailable.".into()))?;
    window
        .set_always_on_top(above_cover)
        .and_then(|()| window.unminimize())
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus())
        .map_err(|error| AppError::Native(error.to_string()))
}

fn request_open_settings(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let lifecycle = lock_runtime(&state)?.lifecycle;
    if is_protected(lifecycle) {
        lock_runtime(&state)?.queue_action(PendingAction::OpenSettings);
        reveal_primary(app)
    } else {
        show_main_window(app, false)
    }
}

fn request_quit_internal(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let lifecycle = lock_runtime(&state)?.lifecycle;
    if is_protected(lifecycle) {
        lock_runtime(&state)?.queue_action(PendingAction::Quit);
        reveal_primary(app)
    } else {
        app.exit(0);
        Ok(())
    }
}

fn request_about(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let protected = is_protected(lock_runtime(&state)?.lifecycle);
    show_main_window(app, protected)?;
    app.emit_to("main", "visualcover://open-about", ())
        .map_err(|error| AppError::Native(error.to_string()))
}

fn tray_menu(app: &AppHandle) -> AppResult<tauri::menu::Menu<tauri::Wry>> {
    let lifecycle = lock_runtime(&app.state::<AppState>())?.lifecycle;
    let mut builder = MenuBuilder::new(app);
    if !is_protected(lifecycle) {
        builder = builder.text(TRAY_ACTIVATE, "Activate Cover");
    }
    builder
        .text(TRAY_OPEN, "Open Settings")
        .text(TRAY_ABOUT, "About")
        .separator()
        .text(TRAY_QUIT, "Quit")
        .build()
        .map_err(|error| AppError::Native(error.to_string()))
}

fn setup_tray(app: &App) -> AppResult<()> {
    let menu = tray_menu(app.handle())?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("VisualCover")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let app = app.clone();
            match id {
                TRAY_ACTIVATE => {
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        let _mutation = state.mutation_gate.lock().await;
                        if let Err(error) = begin_cover(&app, true).await {
                            let status = lock_runtime(&state)
                                .map(|runtime| runtime.config_status)
                                .unwrap_or(ConfigStatus::Corrupt);
                            emit_warning(&app, error.to_string(), status);
                        }
                    });
                }
                TRAY_OPEN => {
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        let _mutation = state.mutation_gate.lock().await;
                        let _ = request_open_settings(&app);
                    });
                }
                TRAY_ABOUT => {
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        let _mutation = state.mutation_gate.lock().await;
                        let _ = request_about(&app);
                    });
                }
                TRAY_QUIT => {
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<AppState>();
                        let _mutation = state.mutation_gate.lock().await;
                        let _ = request_quit_internal(&app);
                    });
                }
                _ => {}
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .build(app)
        .map_err(|error| AppError::Native(error.to_string()))?;
    Ok(())
}

fn refresh_tray_menu(app: &AppHandle) -> AppResult<()> {
    let menu = tray_menu(app)?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))
            .map_err(|error| AppError::Native(error.to_string()))?;
    }
    Ok(())
}

async fn emergency_shortcut_pressed(app: AppHandle) {
    let state = app.state::<AppState>();
    let _mutation = state.mutation_gate.lock().await;
    let allowed = lock_runtime(&state).is_ok_and(|runtime| {
        runtime.lifecycle == CoverLifecycle::Covered
            && runtime.registered_shortcut.is_some()
            && runtime
                .config
                .as_ref()
                .is_some_and(|config| config.settings.emergency_unlock.enabled)
    });
    if allowed {
        let _ = uncover(&app, UnlockReason::Emergency).await;
    }
}

fn handle_single_instance(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            let _ = show_main_window(&app, false);
            return;
        };
        let mutation = state.mutation_gate.lock().await;
        let action = lock_runtime(&state)
            .map(|runtime| runtime.single_instance_action())
            .unwrap_or(SingleInstanceAction::RepairCovers);
        match action {
            SingleInstanceAction::FocusMain => {
                let _ = show_main_window(&app, false);
            }
            SingleInstanceAction::RepairCovers => {
                drop(mutation);
                watchdog_once(&app, true).await;
            }
        }
    });
}

async fn watchdog_once(app: &AppHandle, check_topology: bool) {
    let state = app.state::<AppState>();
    let _mutation = state.mutation_gate.lock().await;
    let snapshot = match lock_runtime(&state) {
        Ok(runtime) => (
            runtime.lifecycle,
            runtime.active.clone(),
            runtime.pending.clone(),
        ),
        Err(_) => return,
    };
    let (lifecycle, active, pending) = snapshot;
    if lifecycle == CoverLifecycle::Uncovered || lifecycle == CoverLifecycle::Uncovering {
        return;
    }

    if let Some(pending) = pending {
        let missing = pending
            .windows
            .iter()
            .any(|spec| app.get_webview_window(&spec.label).is_none());
        if missing || pending.created_at.elapsed() > PENDING_READY_TIMEOUT {
            let labels = pending
                .windows
                .iter()
                .map(|window| window.label.clone())
                .collect::<Vec<_>>();
            destroy_windows(app, &labels);
            let returned = lock_runtime(&state)
                .map(|mut runtime| runtime.abort_pending(&pending.session_id))
                .unwrap_or(false);
            if returned {
                emit_lifecycle(app, CoverLifecycle::Uncovered);
            } else if lifecycle == CoverLifecycle::Covered {
                let _ = begin_cover(app, false).await;
            }
        }
    }

    let Some(active) = active else {
        return;
    };
    let mut needs_replacement = false;
    for spec in &active.windows {
        let Some(window) = app.get_webview_window(&spec.label) else {
            needs_replacement = true;
            continue;
        };
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        if !window.is_visible().unwrap_or(false) {
            let _ = window.show();
        }
        if window.outer_position().ok() != Some(spec.monitor.position)
            || window.outer_size().ok() != Some(spec.monitor.size)
        {
            let _ = apply_cover_geometry(&window, &spec.monitor);
        }
        if !window.is_always_on_top().unwrap_or(false) {
            let _ = window.set_always_on_top(true);
        }
    }

    if check_topology && discover_monitors(app).is_ok_and(|monitors| monitors != active.topology())
    {
        needs_replacement = true;
    }
    if needs_replacement {
        let _ = begin_cover(app, false).await;
    }
}

fn start_watchdog(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticks = 0_u8;
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            ticks = ticks.wrapping_add(1);
            watchdog_once(&app, ticks.is_multiple_of(2)).await;
        }
    });
}

#[cfg(target_os = "windows")]
fn idle_millis() -> Option<u64> {
    use std::mem::size_of;
    use windows::Win32::{
        System::SystemInformation::GetTickCount,
        UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
    };

    let mut input = LASTINPUTINFO {
        cbSize: size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    let ok = unsafe { GetLastInputInfo(&mut input).as_bool() };
    ok.then(|| u64::from(unsafe { GetTickCount() }.wrapping_sub(input.dwTime)))
}

#[cfg(target_os = "windows")]
fn start_idle_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            let state = app.state::<AppState>();
            let should_cover = lock_runtime(&state).is_ok_and(|runtime| {
                runtime.lifecycle == CoverLifecycle::Uncovered
                    && runtime.config_status != ConfigStatus::Corrupt
                    && runtime.config.as_ref().is_some_and(|config| {
                        idle_millis().is_some_and(|elapsed| {
                            idle_should_cover(elapsed, config.settings.idle_minutes)
                        })
                    })
            });
            if should_cover {
                let _mutation = state.mutation_gate.lock().await;
                let _ = begin_cover(&app, true).await;
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn start_idle_monitor(_app: AppHandle) {}

pub fn configure(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    // The single-instance plugin intentionally remains the first registered plugin.
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            handle_single_instance(app);
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .arg("--autostart")
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            emergency_shortcut_pressed(app).await;
                        });
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_bootstrap,
            complete_setup,
            update_preferences,
            change_pin,
            configure_emergency_unlock,
            activate_cover,
            cover_window_ready,
            unlock,
            request_quit,
            reset_corrupt_configuration,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let store = ConfigStore::new(app_data_dir);
            let (config, status) = match store.load() {
                LoadOutcome::Missing => (None, ConfigStatus::Ok),
                LoadOutcome::Loaded { config, status } => (Some(config), status),
                LoadOutcome::Corrupt => (None, ConfigStatus::Corrupt),
            };
            let from_autostart = std::env::args().any(|argument| argument == "--autostart");
            let should_cover_after_launch = from_autostart
                && status != ConfigStatus::Corrupt
                && config
                    .as_ref()
                    .is_some_and(|config| config.settings.cover_after_launch);
            let should_show_main =
                !from_autostart || config.is_none() || status == ConfigStatus::Corrupt;

            app.manage(AppState::new(store, config, status));
            setup_tray(app)?;

            if let Some(main) = app.get_webview_window("main") {
                let main_for_close = main.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_for_close.hide();
                    }
                });
            }
            if should_show_main {
                show_main_window(app.handle(), false)?;
            }

            let handle = app.handle().clone();
            start_watchdog(handle.clone());
            start_idle_monitor(handle.clone());
            if should_cover_after_launch {
                tauri::async_runtime::spawn(async move {
                    // Let the tray and main webview finish initialization before creating covers.
                    tokio::time::sleep(Duration::from_millis(350)).await;
                    let state = handle.state::<AppState>();
                    let _mutation = state.mutation_gate.lock().await;
                    if let Err(error) = begin_cover(&handle, true).await {
                        let status = lock_runtime(&state)
                            .map(|runtime| runtime.config_status)
                            .unwrap_or(ConfigStatus::Corrupt);
                        emit_warning(&handle, error.to_string(), status);
                    }
                });
            }
            Ok(())
        })
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use super::*;
    use crate::model::PublicSettings;

    fn generation(session: &str, x: i32) -> CoverGeneration {
        CoverGeneration {
            session_id: session.into(),
            windows: vec![CoverWindowSpec {
                label: format!("cover-{session}-0"),
                monitor: MonitorSnapshot {
                    name: Some("Display".into()),
                    position: PhysicalPosition::new(x, -120),
                    size: PhysicalSize::new(1920, 1080),
                    scale_factor: 1.25,
                    primary: true,
                },
                role: CoverRole::Primary,
                index: 0,
            }],
            ready: HashSet::new(),
            created_at: Instant::now(),
        }
    }

    fn runtime_with_config() -> RuntimeState {
        RuntimeState::new(
            Some(StoredConfig::new(
                "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQxMjM0NTY3OA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".into(),
                PublicSettings::default(),
            )),
            ConfigStatus::Ok,
        )
    }

    #[test]
    fn lifecycle_activation_is_idempotent() {
        let mut state = runtime_with_config();
        assert!(state.begin_initial_cover().unwrap());
        assert_eq!(state.lifecycle, CoverLifecycle::Covering);
        assert!(!state.begin_initial_cover().unwrap());
        state.lifecycle = CoverLifecycle::Covered;
        assert!(!state.begin_initial_cover().unwrap());
    }

    #[test]
    fn reconciliation_rollback_preserves_active_generation() {
        let mut state = runtime_with_config();
        state.lifecycle = CoverLifecycle::Covered;
        state.active = Some(generation("active", -1920));
        state.pending = Some(generation("replacement", 0));
        assert!(!state.abort_pending("replacement"));
        assert_eq!(state.lifecycle, CoverLifecycle::Covered);
        assert_eq!(state.active.unwrap().session_id, "active");
        assert!(state.pending.is_none());
    }

    #[test]
    fn initial_cover_rollback_discards_transitional_tray_action() {
        let mut state = runtime_with_config();
        assert!(state.begin_initial_cover().unwrap());
        state.pending = Some(generation("pending", 0));
        state.queue_action(PendingAction::Quit);

        assert!(state.abort_pending("pending"));
        assert_eq!(state.lifecycle, CoverLifecycle::Uncovered);
        assert_eq!(state.pending_action, None);
    }

    #[test]
    fn negative_coordinates_and_scale_participate_in_topology_comparison() {
        let left = generation("a", -1920).topology();
        let mut same = generation("b", -1920).topology();
        assert_eq!(left, same);
        same[0].scale_factor = 1.5;
        assert_ne!(left, same);
    }

    #[test]
    fn pending_quit_has_priority_over_open_settings() {
        let mut state = runtime_with_config();
        state.queue_action(PendingAction::OpenSettings);
        state.queue_action(PendingAction::Quit);
        state.queue_action(PendingAction::OpenSettings);
        assert_eq!(state.pending_action, Some(PendingAction::Quit));
    }

    #[test]
    fn emergency_unlock_discards_pending_action() {
        let mut state = runtime_with_config();
        state.pending_action = Some(PendingAction::Quit);
        let action = match UnlockReason::Emergency {
            UnlockReason::Authenticated => state.pending_action.take(),
            UnlockReason::Emergency => {
                state.pending_action = None;
                None
            }
        };
        assert_eq!(action, None);
        assert_eq!(state.pending_action, None);
    }

    #[test]
    fn caller_authorization_is_window_scoped() {
        assert!(authorize("main", Access::Main).is_ok());
        assert!(authorize("cover-session-0", Access::Main).is_err());
        assert!(authorize("cover-session-0", Access::MainOrCover).is_ok());
        assert!(authorize("untrusted", Access::MainOrCover).is_err());
    }

    #[test]
    fn idle_thresholds_are_exact_and_off_stays_off() {
        assert!(!idle_should_cover(u64::MAX, None));
        assert!(!idle_should_cover(299_999, Some(5)));
        assert!(idle_should_cover(300_000, Some(5)));
    }

    #[test]
    fn second_instance_never_focuses_through_an_active_cover() {
        let mut state = runtime_with_config();
        assert_eq!(
            state.single_instance_action(),
            SingleInstanceAction::FocusMain
        );
        state.lifecycle = CoverLifecycle::Covering;
        assert_eq!(
            state.single_instance_action(),
            SingleInstanceAction::RepairCovers
        );
        state.lifecycle = CoverLifecycle::Covered;
        assert_eq!(
            state.single_instance_action(),
            SingleInstanceAction::RepairCovers
        );
    }

    #[test]
    fn default_emergency_shortcut_is_accepted_by_native_registrar() {
        assert!(
            tauri_plugin_global_shortcut::Shortcut::from_str(
                crate::model::DEFAULT_EMERGENCY_SHORTCUT
            )
            .is_ok()
        );
    }
}
