mod db;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app.path().app_data_dir()?;
            let state = db::AppState::new(app_data_dir)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_tracker_state,
            db::get_database_info,
            db::sync_builtin_mappings,
            db::commit_import_payload,
            db::replace_mappings,
            db::delete_raid_by_match_key,
            db::clear_tracker_database,
            db::export_database_backup,
            db::restore_database_backup,
            db::open_database_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
