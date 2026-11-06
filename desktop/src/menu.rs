//! Native Desktop Menu Module
//! Configures native window menus and standard financial workstation keyboard shortcuts.

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Wry};

pub fn build_menu(app: &AppHandle) -> Result<Menu<Wry>, tauri::Error> {
    let mut builder = MenuBuilder::new(app);

    // 1. File Menu
    let refresh_item = MenuItemBuilder::with_id("reload", "Refresh Workspace")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    let force_refresh = MenuItemBuilder::with_id("force_reload", "Restart Frontend Interface")
        .accelerator("CmdOrCtrl+Shift+R")
        .build(app)?;
    let restart_backend_item = MenuItemBuilder::with_id("restart_backend", "Restart Backend Engine")
        .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Tavoryn Terminal")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&refresh_item)
        .item(&force_refresh)
        .separator()
        .item(&restart_backend_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // 2. Edit Menu (standard clipboard operations)
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // 3. View Menu
    let fullscreen_item = MenuItemBuilder::with_id("toggle_fullscreen", "Toggle Fullscreen")
        .accelerator("F11")
        .build(app)?;
    let minimize_item = MenuItemBuilder::with_id("minimize", "Minimize Window")
        .accelerator("CmdOrCtrl+M")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&fullscreen_item)
        .item(&minimize_item)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?)
        .build()?;

    // 4. Terminal Commands & Navigation Menu
    let manual_item = MenuItemBuilder::with_id("open_manual", "Interactive User Manual (HELP)")
        .accelerator("F1")
        .build(app)?;
    let diag_item = MenuItemBuilder::with_id("export_diag", "Export Diagnostic Logs...")
        .build(app)?;

    let terminal_menu = SubmenuBuilder::new(app, "Terminal")
        .item(&manual_item)
        .separator()
        .item(&diag_item)
        .build()?;

    // 5. Help Menu
    let docs_item = MenuItemBuilder::with_id("open_docs", "Online Documentation")
        .build(app)?;
    let github_item = MenuItemBuilder::with_id("open_github", "GitHub Repository")
        .build(app)?;
    let about_item = MenuItemBuilder::with_id("about", "About Tavoryn Terminal")
        .build(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&about_item)
        .separator()
        .item(&docs_item)
        .item(&github_item)
        .build()?;

    builder = builder
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&terminal_menu)
        .item(&help_menu);

    builder.build()
}
