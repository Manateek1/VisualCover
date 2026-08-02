//! VisualCover native application backend.

mod app;
mod error;
mod model;
mod persistence;
mod security;

pub fn run() {
    app::configure(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("failed to run VisualCover");
}
