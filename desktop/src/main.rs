// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
        let crash_dir = std::path::PathBuf::from(app_data).join("com.tavoryn.terminal");
        let _ = std::fs::create_dir_all(&crash_dir);
        let _ = std::fs::write(crash_dir.join("crash.log"), format!("PANIC: {info}\n"));
        eprintln!("PANIC: {info}");
    }));

    tavoryn_terminal_lib::run();
}
