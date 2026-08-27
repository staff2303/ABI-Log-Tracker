mod seed;

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const SCHEMA_VERSION: i64 = 5;
const DB_FILENAME: &str = "abi-tracker.db";

#[derive(Clone)]
pub struct AppState {
    db_path: PathBuf,
    app_data_dir: PathBuf,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
        let db_path = app_data_dir.join(DB_FILENAME);
        init_database(&db_path)?;

        Ok(Self {
            db_path,
            app_data_dir,
        })
    }
}

pub fn init_database(db_path: &PathBuf) -> Result<(), String> {
    let conn = open_connection(db_path)?;
    run_migrations(&conn)?;
    seed_builtin_mappings(&conn).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_tracker_state(state: State<AppState>) -> Result<Value, String> {
    let conn = open_connection(&state.db_path)?;

    Ok(json!({
        "dbInfo": database_info(&state, &conn)?,
        "raids": query_rows(&conn, "SELECT * FROM raids ORDER BY started_at DESC")?,
        "raidSourceFiles": query_rows(&conn, "SELECT * FROM raid_source_files ORDER BY raid_match_key, source_file_id")?,
        "raidConflicts": query_rows(&conn, "SELECT * FROM raid_conflicts ORDER BY raid_match_key, position")?,
        "kills": query_rows(&conn, "SELECT * FROM kills ORDER BY raid_match_key, list_index")?,
        "incomingDamage": query_rows(&conn, "SELECT * FROM incoming_damage ORDER BY raid_match_key, list_index")?,
        "deaths": query_rows(&conn, "SELECT * FROM deaths ORDER BY raid_match_key")?,
        "teamMembers": query_rows(&conn, "SELECT * FROM team_members ORDER BY raid_match_key, position")?,
        "sourceFiles": query_rows(&conn, "SELECT * FROM source_files ORDER BY imported_at DESC")?,
        "importHistory": query_rows(&conn, "SELECT * FROM import_history ORDER BY started_at DESC")?,
        "mappings": query_rows(&conn, "SELECT * FROM mappings ORDER BY id")?,
        "mappingAliases": query_rows(&conn, "SELECT * FROM mapping_aliases ORDER BY mapping_id, position")?,
        "mappingEvidence": query_rows(&conn, "SELECT * FROM mapping_evidence ORDER BY mapping_id, position")?,
        "mappingCandidates": query_rows(&conn, "SELECT * FROM mapping_candidates ORDER BY mapping_id, position")?,
        "mappingSourceFiles": query_rows(&conn, "SELECT * FROM mapping_source_files ORDER BY mapping_id, source_file_id")?,
        "mappingConflicts": query_rows(&conn, "SELECT * FROM mapping_conflicts ORDER BY mapping_id, created_at")?,
        "mappingPatternRules": query_rows(&conn, "SELECT * FROM mapping_pattern_rules ORDER BY namespace, prefix_length DESC, prefix")?,
        "settings": query_rows(&conn, "SELECT * FROM settings ORDER BY key")?
    }))
}

#[tauri::command]
pub fn get_database_info(state: State<AppState>) -> Result<Value, String> {
    let conn = open_connection(&state.db_path)?;
    database_info(&state, &conn)
}

#[tauri::command]
pub fn sync_builtin_mappings(state: State<AppState>) -> Result<Value, String> {
    let conn = open_connection(&state.db_path)?;
    let summary = seed_builtin_mappings(&conn).map_err(|error| error.to_string())?;

    Ok(json!({
        "inserted": summary.inserted,
        "updated": summary.updated,
        "totalBuiltIn": seed::BUILTIN_MAPPINGS.len()
    }))
}

#[tauri::command]
pub fn commit_import_payload(
    state: State<AppState>,
    source_file: Value,
    history: Value,
    raids: Vec<Value>,
) -> Result<(), String> {
    let mut conn = open_connection(&state.db_path)?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;

    upsert_source_file(&tx, &source_file)?;
    upsert_import_history(&tx, &history)?;

    for raid in raids {
        upsert_raid(&tx, &raid)?;
    }

    tx.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn replace_mappings(state: State<AppState>, mappings: Vec<Value>) -> Result<(), String> {
    let mut conn = open_connection(&state.db_path)?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;

    tx.execute("DELETE FROM mapping_aliases", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM mapping_evidence", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM mapping_candidates", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM mapping_source_files", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM mapping_conflicts", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM mapping_pattern_rules", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM mappings", [])
        .map_err(|error| error.to_string())?;

    for mapping in mappings {
        upsert_mapping(&tx, &mapping)?;
    }

    tx.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_raid_by_match_key(state: State<AppState>, match_key: String) -> Result<(), String> {
    let conn = open_connection(&state.db_path)?;
    conn.execute("DELETE FROM raids WHERE match_key = ?1", params![match_key])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_tracker_database(state: State<AppState>, scope: String) -> Result<(), String> {
    let mut conn = open_connection(&state.db_path)?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;

    clear_record_tables(&tx)?;

    if scope == "all" {
        tx.execute("DELETE FROM mapping_aliases", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM mapping_evidence", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM mapping_candidates", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM mapping_source_files", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM mapping_conflicts", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM mapping_pattern_rules", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM mappings", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM settings", [])
            .map_err(|error| error.to_string())?;
    }

    tx.commit().map_err(|error| error.to_string())?;

    if scope == "all" {
        seed_builtin_mappings(&conn).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn export_database_backup(state: State<AppState>) -> Result<Value, String> {
    let conn = open_connection(&state.db_path)?;
    let backup_dir = state.app_data_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|error| error.to_string())?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let destination = backup_dir.join(format!("ABI-Tracker-Backup-{stamp}.db"));
    let destination_text = destination.to_string_lossy().to_string();

    conn.execute("VACUUM INTO ?1", params![destination_text])
        .map_err(|error| error.to_string())?;

    Ok(json!({
        "path": destination.to_string_lossy(),
        "bytes": fs::metadata(&destination).map(|metadata| metadata.len()).unwrap_or(0)
    }))
}

#[tauri::command]
pub fn restore_database_backup(state: State<AppState>, bytes: Vec<u8>) -> Result<(), String> {
    let restore_dir = state.app_data_dir.join("restore");
    fs::create_dir_all(&restore_dir).map_err(|error| error.to_string())?;
    let candidate = restore_dir.join("candidate.db");

    fs::write(&candidate, bytes).map_err(|error| error.to_string())?;
    validate_backup_database(&candidate)?;

    {
        let conn = open_connection(&state.db_path)?;
        conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
            .map_err(|error| error.to_string())?;
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let safety_backup = state
        .app_data_dir
        .join("backups")
        .join(format!("ABI-Tracker-Before-Restore-{stamp}.db"));
    fs::create_dir_all(
        safety_backup
            .parent()
            .ok_or_else(|| "Invalid backup folder.".to_string())?,
    )
    .map_err(|error| error.to_string())?;

    if state.db_path.exists() {
        fs::copy(&state.db_path, &safety_backup).map_err(|error| error.to_string())?;
    }

    remove_sqlite_sidecars(&state.db_path);
    fs::copy(&candidate, &state.db_path).map_err(|error| error.to_string())?;
    init_database(&state.db_path)?;
    Ok(())
}

#[tauri::command]
pub fn open_database_folder(state: State<AppState>) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&state.app_data_dir)
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn validate_backup_database(path: &PathBuf) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    let has_raids: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'raids'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let has_mappings: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'mappings'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;

    if has_raids == 0 || has_mappings == 0 {
        return Err("Backup file is not an ABI Tracker SQLite database.".to_string());
    }

    Ok(())
}

fn remove_sqlite_sidecars(path: &PathBuf) {
    let path_text = path.to_string_lossy().to_string();
    let _ = fs::remove_file(format!("{path_text}-wal"));
    let _ = fs::remove_file(format!("{path_text}-shm"));
}

fn open_connection(db_path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        ",
    )
    .map_err(|error| error.to_string())?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS source_files (
          id TEXT PRIMARY KEY,
          file_hash TEXT NOT NULL UNIQUE,
          filename TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          last_modified INTEGER,
          imported_at TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          mapping_scanner_version TEXT
        );

        CREATE TABLE IF NOT EXISTS import_history (
          id TEXT PRIMARY KEY,
          source_file_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          parser_version TEXT NOT NULL,
          discovered_raids INTEGER NOT NULL DEFAULT 0,
          inserted_raids INTEGER NOT NULL DEFAULT 0,
          same_raids INTEGER NOT NULL DEFAULT 0,
          updated_raids INTEGER NOT NULL DEFAULT 0,
          kept_existing_raids INTEGER NOT NULL DEFAULT 0,
          failed_raids INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          error_message TEXT,
          FOREIGN KEY(source_file_id) REFERENCES source_files(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS raids (
          match_key TEXT PRIMARY KEY,
          raid_id TEXT NOT NULL,
          match_identity TEXT NOT NULL,
          match_identity_type TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          map_id TEXT,
          mode TEXT,
          zone TEXT,
          result TEXT NOT NULL,
          team_type TEXT NOT NULL,

          basic_started_at TEXT,
          basic_ended_at TEXT,
          basic_date_time TEXT,
          basic_map_id TEXT,
          basic_map_unlock_id TEXT,
          basic_map_name TEXT,
          basic_map TEXT,
          basic_mode_id TEXT,
          basic_mode TEXT,
          basic_zone TEXT,
          basic_team_type TEXT,
          basic_has_teammate INTEGER,
          basic_local_player_nickname TEXT,
          basic_squad TEXT,
          basic_play_time_seconds REAL,
          basic_duration_seconds REAL,
          basic_result TEXT,

          combat_pmc_kills REAL,
          combat_ai_kills REAL,
          combat_damage REAL,
          combat_armor_damage REAL,
          combat_hits REAL,
          combat_shots REAL,
          combat_accuracy REAL,
          combat_kill_streak REAL,

          loot_extracted_value REAL,
          loot_items_found REAL,
          loot_weapons_found REAL,
          loot_attachments_found REAL,
          loot_gear_found REAL,
          loot_containers REAL,
          loot_premium_containers REAL,
          loot_xp_from_looting REAL,
          loot_xp_from_unlocking REAL,
          loot_extraction_xp REAL,

          survival_hp_loss REAL,
          survival_healing_done REAL,
          survival_fractures REAL,
          survival_debuffs REAL,
          survival_food_drinks_consumed REAL,
          survival_distance_meters REAL,
          survival_falls REAL,
          survival_teammates_rescued REAL,
          survival_times_rescued REAL,
          survival_support_actions REAL,

          team_detail_type TEXT,
          team_is_team INTEGER,
          team_member_count REAL,
          team_local_player_nickname TEXT,
          team_resolution TEXT,
          team_teammate_rescues REAL,
          team_rescued_by_teammate REAL,
          team_support_actions REAL,

          rank_present INTEGER NOT NULL DEFAULT 0,
          rank_previous_rank TEXT,
          rank_next_rank TEXT,
          rank_previous_rank_level REAL,
          rank_next_rank_level REAL,
          rank_previous_score REAL,
          rank_next_score REAL,
          rank_raw_score_delta REAL,
          rank_delta REAL,
          rank_points_per_rank_level REAL,

          completeness_basic INTEGER,
          completeness_combat_summary INTEGER,
          completeness_kill_details TEXT,
          completeness_incoming_damage TEXT,
          completeness_death_detail TEXT,
          completeness_loot TEXT,
          completeness_survival TEXT,
          completeness_team TEXT,
          completeness_rank TEXT,
          completeness_score REAL,

          merge_updated_from_duplicate INTEGER
        );

        CREATE TABLE IF NOT EXISTS raid_source_files (
          raid_match_key TEXT NOT NULL,
          source_file_id TEXT NOT NULL,
          PRIMARY KEY (raid_match_key, source_file_id),
          FOREIGN KEY(raid_match_key) REFERENCES raids(match_key) ON DELETE CASCADE,
          FOREIGN KEY(source_file_id) REFERENCES source_files(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS raid_conflicts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          raid_match_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          path TEXT NOT NULL,
          existing_value TEXT,
          incoming_value TEXT,
          resolution TEXT NOT NULL,
          FOREIGN KEY(raid_match_key) REFERENCES raids(match_key) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS kills (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          raid_match_key TEXT NOT NULL,
          list_index INTEGER NOT NULL,
          source_record_index REAL,
          time TEXT,
          kill_timestamp REAL,
          enemy_gid TEXT,
          opponent_nickname TEXT NOT NULL,
          opponent_type TEXT NOT NULL,
          enemy_identity TEXT,
          weapon_id TEXT,
          weapon_name TEXT,
          weapon TEXT,
          hit_body_part_id TEXT,
          body_part_name TEXT,
          body_part TEXT,
          opponent_level REAL,
          opponent_rank_level REAL,
          opponent_rank TEXT,
          opponent_rank_score REAL,
          damage REAL,
          armor_damage REAL,
          hit_count REAL,
          raw_damage REAL,
          raw_armor_damage REAL,
          raw_hit_count REAL,
          combat_metrics_unavailable_reason TEXT,
          armor_id TEXT,
          armor_name TEXT,
          opponent_armor TEXT,
          opponent_value REAL,
          opponent_gear_value REAL,
          rank_score_gained REAL,
          death_type TEXT,
          FOREIGN KEY(raid_match_key) REFERENCES raids(match_key) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS incoming_damage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          raid_match_key TEXT NOT NULL,
          list_index INTEGER NOT NULL,
          source_record_start REAL,
          source_record_end REAL,
          attacker_nickname TEXT,
          attacker_gid_internal TEXT,
          attacker_type TEXT NOT NULL,
          death_causer_id TEXT,
          penetration INTEGER,
          armor_id TEXT,
          armor_durability REAL,
          armor_max_durability REAL,
          damage REAL,
          armor_absorbed_damage REAL,
          penetration_rate REAL,
          target_state_raw TEXT,
          body_penetrated INTEGER,
          final_hit_damage REAL,
          consumed_armor_durability REAL,
          last_hit_reduced_damage REAL,
          arm_reduced_damage REAL,
          is_fatal_attacker INTEGER NOT NULL DEFAULT 0,
          dedup_fingerprint TEXT NOT NULL,
          FOREIGN KEY(raid_match_key) REFERENCES raids(match_key) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS deaths (
          raid_match_key TEXT PRIMARY KEY,
          victim_name TEXT,
          killer_nickname TEXT,
          killer_type TEXT,
          killer_level REAL,
          killer_rank TEXT,
          weapon_id TEXT,
          weapon_name TEXT,
          weapon TEXT,
          death_causer_id TEXT,
          ammo_id TEXT,
          ammo_name TEXT,
          ammo_or_cause TEXT,
          hit_body_part_id TEXT,
          hit_body_part_name TEXT,
          hit_body_part TEXT,
          final_damage REAL,
          penetrated INTEGER,
          armor_id TEXT,
          armor_name TEXT,
          armor TEXT,
          armor_before_hit REAL,
          armor_at_hit REAL,
          armor_max REAL,
          face_hit INTEGER,
          dbno INTEGER,
          player_x REAL,
          player_y REAL,
          player_z REAL,
          killer_x REAL,
          killer_y REAL,
          killer_z REAL,
          death_server_time REAL,
          replay_demo_start_time REAL,
          replay_demo_end_time REAL,
          FOREIGN KEY(raid_match_key) REFERENCES raids(match_key) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS team_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          raid_match_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          nickname TEXT,
          status TEXT NOT NULL,
          FOREIGN KEY(raid_match_key) REFERENCES raids(match_key) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mappings (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL DEFAULT 'item',
          raw_id TEXT,
          category TEXT NOT NULL,
          subcategory TEXT,
          suggested_category TEXT,
          name TEXT,
          display_name TEXT,
          builtin_name TEXT,
          user_name TEXT,
          internal_name TEXT,
          canonical_internal_name TEXT,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          raw_blueprint TEXT,
          confidence TEXT,
          confirmation_type TEXT,
          occurrence_count INTEGER NOT NULL DEFAULT 0,
          first_seen_at TEXT,
          last_seen_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          user_edited INTEGER NOT NULL DEFAULT 0,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS mapping_aliases (
          mapping_id TEXT NOT NULL,
          alias TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY(mapping_id, alias),
          FOREIGN KEY(mapping_id) REFERENCES mappings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mapping_source_files (
          mapping_id TEXT NOT NULL,
          source_file_id TEXT NOT NULL,
          PRIMARY KEY(mapping_id, source_file_id),
          FOREIGN KEY(mapping_id) REFERENCES mappings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mapping_evidence (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mapping_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          evidence_type TEXT NOT NULL,
          value TEXT,
          occurrences INTEGER NOT NULL,
          source_file_id TEXT,
          sample TEXT,
          source_event TEXT,
          source_module TEXT,
          raw_line TEXT,
          raw_context TEXT,
          observed_name TEXT,
          observed_internal_name TEXT,
          observed_category TEXT,
          gid TEXT,
          actor_instance TEXT,
          timestamp TEXT,
          FOREIGN KEY(mapping_id) REFERENCES mappings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mapping_candidates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mapping_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          candidate_name TEXT NOT NULL,
          candidate_source TEXT NOT NULL,
          occurrences INTEGER NOT NULL,
          first_seen_at TEXT,
          last_seen_at TEXT,
          source_file_ids TEXT,
          FOREIGN KEY(mapping_id) REFERENCES mappings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mapping_conflicts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mapping_id TEXT NOT NULL,
          existing_value TEXT,
          incoming_value TEXT,
          evidence_type TEXT,
          source_file_id TEXT,
          raw_context TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(mapping_id) REFERENCES mappings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mapping_pattern_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          namespace TEXT NOT NULL,
          prefix TEXT NOT NULL,
          prefix_length INTEGER NOT NULL,
          category TEXT NOT NULL,
          sample_count INTEGER NOT NULL,
          matching_count INTEGER NOT NULL,
          purity REAL NOT NULL,
          status TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(namespace, prefix, category)
        );

        CREATE INDEX IF NOT EXISTS idx_raids_started_at ON raids(started_at);
        CREATE INDEX IF NOT EXISTS idx_raids_map ON raids(map_id);
        CREATE INDEX IF NOT EXISTS idx_raids_result ON raids(result);
        CREATE INDEX IF NOT EXISTS idx_raids_team_type ON raids(team_type);
        CREATE INDEX IF NOT EXISTS idx_kills_raid ON kills(raid_match_key);
        CREATE INDEX IF NOT EXISTS idx_kills_weapon ON kills(weapon_id);
        CREATE INDEX IF NOT EXISTS idx_kills_opponent ON kills(opponent_nickname);
        CREATE INDEX IF NOT EXISTS idx_incoming_raid ON incoming_damage(raid_match_key);
        CREATE INDEX IF NOT EXISTS idx_incoming_death_causer ON incoming_damage(death_causer_id);
        CREATE INDEX IF NOT EXISTS idx_deaths_killer ON deaths(killer_nickname);
        CREATE INDEX IF NOT EXISTS idx_mappings_category ON mappings(category);
        CREATE INDEX IF NOT EXISTS idx_mappings_status ON mappings(status);
        CREATE INDEX IF NOT EXISTS idx_mappings_source ON mappings(source);
        CREATE INDEX IF NOT EXISTS idx_import_history_started_at ON import_history(started_at);
        ",
    )
    .map_err(|error| error.to_string())?;

    let previous_schema_version = read_schema_version(conn).unwrap_or(0);

    ensure_column(conn, "source_files", "mapping_scanner_version", "TEXT")?;
    ensure_column(conn, "mapping_candidates", "source_file_ids", "TEXT")?;
    ensure_column(conn, "mappings", "namespace", "TEXT NOT NULL DEFAULT 'item'")?;
    ensure_column(conn, "mappings", "raw_id", "TEXT")?;
    ensure_column(conn, "mappings", "subcategory", "TEXT")?;
    ensure_column(conn, "mappings", "display_name", "TEXT")?;
    ensure_column(conn, "mappings", "internal_name", "TEXT")?;
    ensure_column(conn, "mappings", "canonical_internal_name", "TEXT")?;
    ensure_column(conn, "mappings", "confirmation_type", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "source_event", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "source_module", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "raw_line", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "raw_context", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "observed_name", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "observed_internal_name", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "observed_category", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "gid", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "actor_instance", "TEXT")?;
    ensure_column(conn, "mapping_evidence", "timestamp", "TEXT")?;

    if previous_schema_version < 5 {
        clear_mapping_tables(conn)?;
    }

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_mappings_namespace_raw_id ON mappings(namespace, raw_id)",
        [],
    )
    .map_err(|error| error.to_string())?;

    cleanup_ignored_mapping_artifacts(conn)?;

    conn.execute(
        "INSERT INTO schema_meta(key, value) VALUES('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SCHEMA_VERSION.to_string()],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn read_schema_version(conn: &Connection) -> Result<i64, String> {
    let value = conn
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    Ok(value.and_then(|text| text.parse::<i64>().ok()).unwrap_or(0))
}

fn clear_mapping_tables(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM mapping_aliases", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM mapping_evidence", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM mapping_candidates", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM mapping_source_files", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM mapping_conflicts", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM mapping_pattern_rules", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM mappings", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn cleanup_ignored_mapping_artifacts(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        DELETE FROM mapping_candidates
        WHERE candidate_source = 'blueprint'
          AND (
            candidate_name = 'BP_IconScaleBoxPaddingComponent'
            OR candidate_name LIKE '%IconScaleBoxPaddingComponent%'
          );

        DELETE FROM mapping_evidence
        WHERE (
            evidence_type = 'blueprint'
            OR value LIKE 'BP_%'
          )
          AND (
            value = 'BP_IconScaleBoxPaddingComponent'
            OR value LIKE '%IconScaleBoxPaddingComponent%'
          );

        UPDATE mappings
        SET raw_blueprint = NULL
        WHERE raw_blueprint = 'BP_IconScaleBoxPaddingComponent'
           OR raw_blueprint LIKE '%IconScaleBoxPaddingComponent%';
        ",
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<(), String> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = conn.prepare(&pragma).map_err(|error| error.to_string())?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if columns.iter().any(|existing| existing == column) {
        return Ok(());
    }

    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    conn.execute(&sql, []).map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(Default)]
struct SeedSummary {
    inserted: usize,
    updated: usize,
}

fn seed_builtin_mappings(conn: &Connection) -> rusqlite::Result<SeedSummary> {
    let now = current_timestamp();
    let mut summary = SeedSummary::default();

    for builtin in seed::BUILTIN_MAPPINGS {
        let namespace = namespace_for_category(builtin.category);
        let mapping_id = mapping_key(namespace, builtin.id);
        let existing: Option<(String, i64)> = conn
            .query_row(
                "SELECT COALESCE(builtin_name, ''), user_edited FROM mappings WHERE id = ?1",
                params![mapping_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        match existing {
            None => {
                summary.inserted += 1;
                conn.execute(
                    "
                    INSERT INTO mappings (
                      id, namespace, raw_id, category, subcategory, suggested_category, name, display_name,
                      builtin_name, user_name, internal_name, canonical_internal_name, status, source,
                      raw_blueprint, confidence, confirmation_type, occurrence_count, first_seen_at, last_seen_at,
                      created_at, updated_at, user_edited, notes
                    )
                    VALUES (?1, ?2, ?3, ?4, NULL, ?4, ?5, ?5,
                      ?5, NULL, NULL, NULL, 'confirmed', 'builtin',
                      NULL, 'confirmed', 'builtin', 0, NULL, NULL, ?6, ?6, 0, NULL)
                    ",
                    params![mapping_id, namespace, builtin.id, builtin.category, builtin.name, now],
                )?;
            }
            Some((existing_builtin_name, user_edited)) => {
                if existing_builtin_name != builtin.name {
                    summary.updated += 1;
                    if user_edited == 0 {
                        conn.execute(
                            "
                            UPDATE mappings
                            SET namespace = ?2,
                                raw_id = ?3,
                                category = ?4,
                                suggested_category = ?4,
                                name = ?5,
                                display_name = ?5,
                                builtin_name = ?5,
                                status = 'confirmed',
                                source = 'builtin',
                                confidence = 'confirmed',
                                confirmation_type = 'builtin',
                                updated_at = ?6
                            WHERE id = ?1
                            ",
                            params![mapping_id, namespace, builtin.id, builtin.category, builtin.name, now],
                        )?;
                    } else {
                        conn.execute(
                            "UPDATE mappings SET namespace = ?2, raw_id = ?3, builtin_name = ?5, suggested_category = COALESCE(suggested_category, ?4), updated_at = ?6 WHERE id = ?1",
                            params![mapping_id, namespace, builtin.id, builtin.category, builtin.name, now],
                        )?;
                    }
                }
            }
        }
    }

    Ok(summary)
}

fn namespace_for_category(category: &str) -> &'static str {
    match category {
        "map" => "map",
        "bodyPart" => "gameplay_tag",
        _ => "item",
    }
}

fn mapping_key(namespace: &str, raw_id: &str) -> String {
    format!("{namespace}:{raw_id}")
}

fn upsert_source_file(conn: &Connection, source_file: &Value) -> Result<(), String> {
    upsert_row(
        conn,
        "source_files",
        &["id"],
        vec![
            ("id", sql_text_path(source_file, &["id"])),
            ("file_hash", sql_text_path(source_file, &["fileHash"])),
            ("filename", sql_text_path(source_file, &["filename"])),
            ("file_size", sql_number_path(source_file, &["fileSize"])),
            (
                "last_modified",
                sql_number_path(source_file, &["lastModified"]),
            ),
            ("imported_at", sql_text_path(source_file, &["importedAt"])),
            (
                "parser_version",
                sql_text_path(source_file, &["parserVersion"]),
            ),
            (
                "mapping_scanner_version",
                sql_text_path(source_file, &["mappingScannerVersion"]),
            ),
        ],
    )
}

fn upsert_import_history(conn: &Connection, history: &Value) -> Result<(), String> {
    upsert_row(
        conn,
        "import_history",
        &["id"],
        vec![
            ("id", sql_text_path(history, &["id"])),
            ("source_file_id", sql_text_path(history, &["sourceFileId"])),
            ("filename", sql_text_path(history, &["filename"])),
            ("started_at", sql_text_path(history, &["startedAt"])),
            ("completed_at", sql_text_path(history, &["completedAt"])),
            ("parser_version", sql_text_path(history, &["parserVersion"])),
            (
                "discovered_raids",
                sql_number_path(history, &["discoveredRaids"]),
            ),
            (
                "inserted_raids",
                sql_number_path(history, &["insertedRaids"]),
            ),
            ("same_raids", sql_number_path(history, &["sameRaids"])),
            ("updated_raids", sql_number_path(history, &["updatedRaids"])),
            (
                "kept_existing_raids",
                sql_number_path(history, &["keptExistingRaids"]),
            ),
            ("failed_raids", sql_number_path(history, &["failedRaids"])),
            ("status", sql_text_path(history, &["status"])),
            ("error_message", sql_text_path(history, &["errorMessage"])),
        ],
    )
}

fn upsert_raid(conn: &Connection, raid: &Value) -> Result<(), String> {
    let match_key =
        text_path(raid, &["matchKey"]).ok_or_else(|| "Raid matchKey is required.".to_string())?;

    upsert_row(conn, "raids", &["match_key"], raid_columns(raid))?;

    conn.execute(
        "DELETE FROM raid_source_files WHERE raid_match_key = ?1",
        params![match_key],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "DELETE FROM raid_conflicts WHERE raid_match_key = ?1",
        params![match_key],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "DELETE FROM kills WHERE raid_match_key = ?1",
        params![match_key],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "DELETE FROM incoming_damage WHERE raid_match_key = ?1",
        params![match_key],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "DELETE FROM deaths WHERE raid_match_key = ?1",
        params![match_key],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "DELETE FROM team_members WHERE raid_match_key = ?1",
        params![match_key],
    )
    .map_err(|error| error.to_string())?;

    if let Some(source_ids) = raid.get("sourceFileIds").and_then(Value::as_array) {
        for source_id in source_ids.iter().filter_map(Value::as_str) {
            conn.execute(
                "INSERT OR IGNORE INTO raid_source_files(raid_match_key, source_file_id) VALUES(?1, ?2)",
                params![match_key, source_id],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    if let Some(conflicts) = pointer_array(raid, &["mergeMeta", "conflicts"]) {
        for (position, conflict) in conflicts.iter().enumerate() {
            conn.execute(
                "
                INSERT INTO raid_conflicts(
                  raid_match_key, position, path, existing_value, incoming_value, resolution
                )
                VALUES(?1, ?2, ?3, ?4, ?5, ?6)
                ",
                params![
                    match_key,
                    position as i64,
                    text_path(conflict, &["path"]),
                    json_string_path(conflict, &["existingValue"]),
                    json_string_path(conflict, &["incomingValue"]),
                    text_path(conflict, &["resolution"])
                ],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    if let Some(kills) = raid.get("kills").and_then(Value::as_array) {
        for (position, kill) in kills.iter().enumerate() {
            insert_kill(conn, &match_key, position, kill)?;
        }
    }

    if let Some(events) = raid.get("incomingDamage").and_then(Value::as_array) {
        for (position, event) in events.iter().enumerate() {
            insert_incoming_damage(conn, &match_key, position, event)?;
        }
    }

    if let Some(death) = raid.get("death").filter(|value| !value.is_null()) {
        insert_death(conn, &match_key, death)?;
    }

    if let Some(members) = pointer_array(raid, &["team", "members"]) {
        for (position, member) in members.iter().enumerate() {
            conn.execute(
                "INSERT INTO team_members(raid_match_key, position, nickname, status) VALUES(?1, ?2, ?3, ?4)",
                params![
                    match_key,
                    position as i64,
                    text_path(member, &["nickname"]),
                    text_path(member, &["status"]).unwrap_or_else(|| "unknown".to_string())
                ],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn raid_columns(raid: &Value) -> Vec<(&'static str, SqlValue)> {
    vec![
        ("match_key", sql_text_path(raid, &["matchKey"])),
        ("raid_id", sql_text_path(raid, &["id"])),
        ("match_identity", sql_text_path(raid, &["matchIdentity"])),
        (
            "match_identity_type",
            sql_text_path(raid, &["matchIdentityType"]),
        ),
        ("parser_version", sql_text_path(raid, &["parserVersion"])),
        ("schema_version", sql_number_path(raid, &["schemaVersion"])),
        ("created_at", sql_text_path(raid, &["createdAt"])),
        ("updated_at", sql_text_path(raid, &["updatedAt"])),
        ("started_at", sql_text_path(raid, &["startedAt"])),
        ("map_id", sql_id_path(raid, &["mapId"])),
        ("mode", sql_text_path(raid, &["mode"])),
        ("zone", sql_text_path(raid, &["zone"])),
        ("result", sql_text_path(raid, &["result"])),
        ("team_type", sql_text_path(raid, &["teamType"])),
        (
            "basic_started_at",
            sql_text_path(raid, &["basic", "startedAt"]),
        ),
        ("basic_ended_at", sql_text_path(raid, &["basic", "endedAt"])),
        (
            "basic_date_time",
            sql_text_path(raid, &["basic", "dateTime"]),
        ),
        ("basic_map_id", sql_id_path(raid, &["basic", "mapId"])),
        (
            "basic_map_unlock_id",
            sql_id_path(raid, &["basic", "mapUnlockId"]),
        ),
        ("basic_map_name", sql_text_path(raid, &["basic", "mapName"])),
        ("basic_map", sql_text_path(raid, &["basic", "map"])),
        ("basic_mode_id", sql_id_path(raid, &["basic", "modeId"])),
        ("basic_mode", sql_text_path(raid, &["basic", "mode"])),
        ("basic_zone", sql_text_path(raid, &["basic", "zone"])),
        ("basic_team_type", sql_id_path(raid, &["basic", "teamType"])),
        (
            "basic_has_teammate",
            sql_bool_path(raid, &["basic", "hasTeammate"]),
        ),
        (
            "basic_local_player_nickname",
            sql_text_path(raid, &["basic", "localPlayerNickname"]),
        ),
        ("basic_squad", sql_text_path(raid, &["basic", "squad"])),
        (
            "basic_play_time_seconds",
            sql_number_path(raid, &["basic", "playTimeSeconds"]),
        ),
        (
            "basic_duration_seconds",
            sql_number_path(raid, &["basic", "durationSeconds"]),
        ),
        ("basic_result", sql_text_path(raid, &["basic", "result"])),
        (
            "combat_pmc_kills",
            sql_number_path(raid, &["combat", "pmcKills"]),
        ),
        (
            "combat_ai_kills",
            sql_number_path(raid, &["combat", "aiKills"]),
        ),
        (
            "combat_damage",
            sql_number_path(raid, &["combat", "damage"]),
        ),
        (
            "combat_armor_damage",
            sql_number_path(raid, &["combat", "armorDamage"]),
        ),
        ("combat_hits", sql_number_path(raid, &["combat", "hits"])),
        ("combat_shots", sql_number_path(raid, &["combat", "shots"])),
        (
            "combat_accuracy",
            sql_number_path(raid, &["combat", "accuracy"]),
        ),
        (
            "combat_kill_streak",
            sql_number_path(raid, &["combat", "killStreak"]),
        ),
        (
            "loot_extracted_value",
            sql_number_path(raid, &["loot", "extractedValue"]),
        ),
        (
            "loot_items_found",
            sql_number_path(raid, &["loot", "itemsFound"]),
        ),
        (
            "loot_weapons_found",
            sql_number_path(raid, &["loot", "weaponsFound"]),
        ),
        (
            "loot_attachments_found",
            sql_number_path(raid, &["loot", "attachmentsFound"]),
        ),
        (
            "loot_gear_found",
            sql_number_path(raid, &["loot", "gearFound"]),
        ),
        (
            "loot_containers",
            sql_number_path(raid, &["loot", "containers"]),
        ),
        (
            "loot_premium_containers",
            sql_number_path(raid, &["loot", "premiumContainers"]),
        ),
        (
            "loot_xp_from_looting",
            sql_number_path(raid, &["loot", "xpFromLooting"]),
        ),
        (
            "loot_xp_from_unlocking",
            sql_number_path(raid, &["loot", "xpFromUnlocking"]),
        ),
        (
            "loot_extraction_xp",
            sql_number_path(raid, &["loot", "extractionXp"]),
        ),
        (
            "survival_hp_loss",
            sql_number_path(raid, &["survival", "hpLoss"]),
        ),
        (
            "survival_healing_done",
            sql_number_path(raid, &["survival", "healingDone"]),
        ),
        (
            "survival_fractures",
            sql_number_path(raid, &["survival", "fractures"]),
        ),
        (
            "survival_debuffs",
            sql_number_path(raid, &["survival", "debuffs"]),
        ),
        (
            "survival_food_drinks_consumed",
            sql_number_path(raid, &["survival", "foodDrinksConsumed"]),
        ),
        (
            "survival_distance_meters",
            sql_number_path(raid, &["survival", "distanceMeters"]),
        ),
        (
            "survival_falls",
            sql_number_path(raid, &["survival", "falls"]),
        ),
        (
            "survival_teammates_rescued",
            sql_number_path(raid, &["survival", "teammatesRescued"]),
        ),
        (
            "survival_times_rescued",
            sql_number_path(raid, &["survival", "timesRescued"]),
        ),
        (
            "survival_support_actions",
            sql_number_path(raid, &["survival", "supportActions"]),
        ),
        ("team_detail_type", sql_text_path(raid, &["team", "type"])),
        ("team_is_team", sql_bool_path(raid, &["team", "isTeam"])),
        (
            "team_member_count",
            sql_number_path(raid, &["team", "memberCount"]),
        ),
        (
            "team_local_player_nickname",
            sql_text_path(raid, &["team", "localPlayerNickname"]),
        ),
        (
            "team_resolution",
            sql_text_path(raid, &["team", "resolution"]),
        ),
        (
            "team_teammate_rescues",
            sql_number_path(raid, &["team", "teammateRescues"]),
        ),
        (
            "team_rescued_by_teammate",
            sql_number_path(raid, &["team", "rescuedByTeammate"]),
        ),
        (
            "team_support_actions",
            sql_number_path(raid, &["team", "supportActions"]),
        ),
        (
            "rank_present",
            SqlValue::Integer(if raid.get("rank").is_some_and(|value| !value.is_null()) {
                1
            } else {
                0
            }),
        ),
        (
            "rank_previous_rank",
            sql_text_path(raid, &["rank", "previousRank"]),
        ),
        ("rank_next_rank", sql_text_path(raid, &["rank", "nextRank"])),
        (
            "rank_previous_rank_level",
            sql_number_path(raid, &["rank", "previousRankLevel"]),
        ),
        (
            "rank_next_rank_level",
            sql_number_path(raid, &["rank", "nextRankLevel"]),
        ),
        (
            "rank_previous_score",
            sql_number_path(raid, &["rank", "previousScore"]),
        ),
        (
            "rank_next_score",
            sql_number_path(raid, &["rank", "nextScore"]),
        ),
        (
            "rank_raw_score_delta",
            sql_number_path(raid, &["rank", "rawScoreDelta"]),
        ),
        ("rank_delta", sql_number_path(raid, &["rank", "delta"])),
        (
            "rank_points_per_rank_level",
            sql_number_path(raid, &["rank", "pointsPerRankLevel"]),
        ),
        (
            "completeness_basic",
            sql_bool_path(raid, &["completeness", "basic"]),
        ),
        (
            "completeness_combat_summary",
            sql_bool_path(raid, &["completeness", "combatSummary"]),
        ),
        (
            "completeness_kill_details",
            sql_text_path(raid, &["completeness", "killDetails"]),
        ),
        (
            "completeness_incoming_damage",
            sql_text_path(raid, &["completeness", "incomingDamage"]),
        ),
        (
            "completeness_death_detail",
            sql_text_path(raid, &["completeness", "deathDetail"]),
        ),
        (
            "completeness_loot",
            sql_text_path(raid, &["completeness", "loot"]),
        ),
        (
            "completeness_survival",
            sql_text_path(raid, &["completeness", "survival"]),
        ),
        (
            "completeness_team",
            sql_text_path(raid, &["completeness", "team"]),
        ),
        (
            "completeness_rank",
            sql_text_path(raid, &["completeness", "rank"]),
        ),
        (
            "completeness_score",
            sql_number_path(raid, &["completeness", "score"]),
        ),
        (
            "merge_updated_from_duplicate",
            sql_bool_path(raid, &["mergeMeta", "updatedFromDuplicate"]),
        ),
    ]
}

fn insert_kill(
    conn: &Connection,
    match_key: &str,
    position: usize,
    kill: &Value,
) -> Result<(), String> {
    conn.execute(
        "
        INSERT INTO kills(
          raid_match_key, list_index, source_record_index, time, kill_timestamp, enemy_gid,
          opponent_nickname, opponent_type, enemy_identity, weapon_id, weapon_name, weapon,
          hit_body_part_id, body_part_name, body_part, opponent_level, opponent_rank_level,
          opponent_rank, opponent_rank_score, damage, armor_damage, hit_count, raw_damage,
          raw_armor_damage, raw_hit_count, combat_metrics_unavailable_reason, armor_id,
          armor_name, opponent_armor, opponent_value, opponent_gear_value, rank_score_gained,
          death_type
        )
        VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
          ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29,
          ?30, ?31, ?32, ?33)
        ",
        params![
            match_key,
            position as i64,
            number_path(kill, &["sourceRecordIndex"]),
            text_path(kill, &["time"]),
            number_path(kill, &["killTimestamp"]),
            text_path(kill, &["enemyGid"]),
            text_path(kill, &["opponentNickname"]).unwrap_or_else(|| "Unknown".to_string()),
            text_path(kill, &["opponentType"]).unwrap_or_else(|| "unknown".to_string()),
            id_path(kill, &["enemyIdentity"]),
            id_path(kill, &["weaponId"]),
            text_path(kill, &["weaponName"]),
            text_path(kill, &["weapon"]),
            id_path(kill, &["hitBodyPartId"]),
            text_path(kill, &["bodyPartName"]),
            text_path(kill, &["bodyPart"]),
            number_path(kill, &["opponentLevel"]),
            number_path(kill, &["opponentRankLevel"]),
            text_path(kill, &["opponentRank"]),
            number_path(kill, &["opponentRankScore"]),
            number_path(kill, &["damage"]),
            number_path(kill, &["armorDamage"]),
            number_path(kill, &["hitCount"]),
            number_path(kill, &["rawDamage"]),
            number_path(kill, &["rawArmorDamage"]),
            number_path(kill, &["rawHitCount"]),
            text_path(kill, &["combatMetricsUnavailableReason"]),
            id_path(kill, &["armorId"]),
            text_path(kill, &["armorName"]),
            text_path(kill, &["opponentArmor"]),
            number_path(kill, &["opponentValue"]),
            number_path(kill, &["opponentGearValue"]),
            number_path(kill, &["rankScoreGained"]),
            id_path(kill, &["deathType"]),
        ],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn insert_incoming_damage(
    conn: &Connection,
    match_key: &str,
    position: usize,
    event: &Value,
) -> Result<(), String> {
    conn.execute(
        "
        INSERT INTO incoming_damage(
          raid_match_key, list_index, source_record_start, source_record_end, attacker_nickname,
          attacker_gid_internal, attacker_type, death_causer_id, penetration, armor_id,
          armor_durability, armor_max_durability, damage, armor_absorbed_damage, penetration_rate,
          target_state_raw, body_penetrated, final_hit_damage, consumed_armor_durability,
          last_hit_reduced_damage, arm_reduced_damage, is_fatal_attacker, dedup_fingerprint
        )
        VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
          ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
        ",
        params![
            match_key,
            position as i64,
            number_path(event, &["sourceRecordStart"]),
            number_path(event, &["sourceRecordEnd"]),
            text_path(event, &["attackerNickname"]),
            text_path(event, &["attackerGidInternal"]),
            text_path(event, &["attackerType"]).unwrap_or_else(|| "unknown".to_string()),
            id_path(event, &["deathCauserId"]),
            bool_path(event, &["penetration"]),
            id_path(event, &["armorId"]),
            number_path(event, &["armorDurability"]),
            number_path(event, &["armorMaxDurability"]),
            number_path(event, &["damage"]),
            number_path(event, &["armorAbsorbedDamage"]),
            number_path(event, &["penetrationRate"]),
            id_path(event, &["targetStateRaw"]),
            bool_path(event, &["bodyPenetrated"]),
            number_path(event, &["finalHitDamage"]),
            number_path(event, &["consumedArmorDurability"]),
            number_path(event, &["lastHitReducedDamage"]),
            number_path(event, &["armReducedDamage"]),
            bool_path(event, &["isFatalAttacker"]).unwrap_or(0),
            text_path(event, &["dedupFingerprint"])
                .unwrap_or_else(|| format!("{match_key}:{position}")),
        ],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn insert_death(conn: &Connection, match_key: &str, death: &Value) -> Result<(), String> {
    conn.execute(
        "
        INSERT INTO deaths(
          raid_match_key, victim_name, killer_nickname, killer_type, killer_level, killer_rank,
          weapon_id, weapon_name, weapon, death_causer_id, ammo_id, ammo_name, ammo_or_cause,
          hit_body_part_id, hit_body_part_name, hit_body_part, final_damage, penetrated,
          armor_id, armor_name, armor, armor_before_hit, armor_at_hit, armor_max, face_hit, dbno,
          player_x, player_y, player_z, killer_x, killer_y, killer_z,
          death_server_time, replay_demo_start_time, replay_demo_end_time
        )
        VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
          ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29,
          ?30, ?31, ?32, ?33, ?34, ?35)
        ",
        params![
            match_key,
            text_path(death, &["victimName"]),
            text_path(death, &["killerNickname"]),
            text_path(death, &["killerType"]),
            number_path(death, &["killerLevel"]),
            text_path(death, &["killerRank"]),
            id_path(death, &["weaponId"]),
            text_path(death, &["weaponName"]),
            text_path(death, &["weapon"]),
            id_path(death, &["deathCauserId"]),
            id_path(death, &["ammoId"]),
            text_path(death, &["ammoName"]),
            text_path(death, &["ammoOrCause"]),
            id_path(death, &["hitBodyPartId"]),
            text_path(death, &["hitBodyPartName"]),
            text_path(death, &["hitBodyPart"]),
            number_path(death, &["finalDamage"]),
            bool_path(death, &["penetrated"]),
            id_path(death, &["armorId"]),
            text_path(death, &["armorName"]),
            text_path(death, &["armor"]),
            number_path(death, &["armorDurability", "beforeHit"]),
            number_path(death, &["armorDurability", "atHit"]),
            number_path(death, &["armorDurability", "max"]),
            bool_path(death, &["faceHit"]),
            bool_path(death, &["dbno"]),
            number_path(death, &["playerPosition", "x"]),
            number_path(death, &["playerPosition", "y"]),
            number_path(death, &["playerPosition", "z"]),
            number_path(death, &["killerPosition", "x"]),
            number_path(death, &["killerPosition", "y"]),
            number_path(death, &["killerPosition", "z"]),
            number_path(death, &["deathServerTime"]),
            number_path(death, &["replayDemoStartTime"]),
            number_path(death, &["replayDemoEndTime"]),
        ],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn upsert_mapping(conn: &Connection, mapping: &Value) -> Result<(), String> {
    let id = text_path(mapping, &["id"]).ok_or_else(|| "Mapping id is required.".to_string())?;

    upsert_row(
        conn,
        "mappings",
        &["id"],
        vec![
            ("id", SqlValue::Text(id.clone())),
            ("namespace", sql_text_path(mapping, &["namespace"])),
            ("raw_id", sql_text_path(mapping, &["rawId"])),
            ("category", sql_text_path(mapping, &["category"])),
            ("subcategory", sql_text_path(mapping, &["subcategory"])),
            (
                "suggested_category",
                sql_text_path(mapping, &["suggestedCategory"]),
            ),
            ("name", sql_text_path(mapping, &["name"])),
            ("display_name", sql_text_path(mapping, &["displayName"])),
            ("builtin_name", sql_text_path(mapping, &["builtinName"])),
            ("user_name", sql_text_path(mapping, &["userName"])),
            ("internal_name", sql_text_path(mapping, &["internalName"])),
            (
                "canonical_internal_name",
                sql_text_path(mapping, &["canonicalInternalName"]),
            ),
            ("status", sql_text_path(mapping, &["status"])),
            ("source", sql_text_path(mapping, &["source"])),
            ("raw_blueprint", sql_text_path(mapping, &["rawBlueprint"])),
            ("confidence", sql_text_path(mapping, &["confidence"])),
            (
                "confirmation_type",
                sql_text_path(mapping, &["confirmationType"]),
            ),
            (
                "occurrence_count",
                sql_number_path(mapping, &["occurrenceCount"]),
            ),
            ("first_seen_at", sql_text_path(mapping, &["firstSeenAt"])),
            ("last_seen_at", sql_text_path(mapping, &["lastSeenAt"])),
            ("created_at", sql_text_path(mapping, &["createdAt"])),
            ("updated_at", sql_text_path(mapping, &["updatedAt"])),
            ("user_edited", sql_bool_path(mapping, &["userEdited"])),
            ("notes", sql_text_path(mapping, &["notes"])),
        ],
    )?;

    if let Some(aliases) = mapping.get("aliases").and_then(Value::as_array) {
        for (position, alias) in aliases.iter().filter_map(Value::as_str).enumerate() {
            conn.execute(
                "INSERT OR REPLACE INTO mapping_aliases(mapping_id, alias, position) VALUES(?1, ?2, ?3)",
                params![id, alias, position as i64],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    if let Some(source_file_ids) = mapping.get("sourceFileIds").and_then(Value::as_array) {
        for source_file_id in source_file_ids.iter().filter_map(Value::as_str) {
            conn.execute(
                "INSERT OR IGNORE INTO mapping_source_files(mapping_id, source_file_id) VALUES(?1, ?2)",
                params![id, source_file_id],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    if let Some(evidence) = mapping.get("evidence").and_then(Value::as_array) {
        for (position, item) in evidence.iter().enumerate() {
            conn.execute(
                "
                INSERT INTO mapping_evidence(
                  mapping_id, position, evidence_type, value, occurrences, source_file_id, sample,
                  source_event, source_module, raw_line, raw_context, observed_name,
                  observed_internal_name, observed_category, gid, actor_instance, timestamp
                )
                VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                ",
                params![
                    id,
                    position as i64,
                    text_path(item, &["type"]).unwrap_or_else(|| "id-usage".to_string()),
                    text_path(item, &["value"]),
                    number_path(item, &["occurrences"]).unwrap_or(1.0) as i64,
                    text_path(item, &["sourceFileId"]),
                    text_path(item, &["sample"]),
                    text_path(item, &["sourceEvent"]),
                    text_path(item, &["sourceModule"]),
                    text_path(item, &["rawLine"]),
                    text_path(item, &["rawContext"]),
                    text_path(item, &["observedName"]),
                    text_path(item, &["observedInternalName"]),
                    text_path(item, &["observedCategory"]),
                    text_path(item, &["gid"]),
                    text_path(item, &["actorInstance"]),
                    text_path(item, &["timestamp"]),
                ],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    if let Some(candidates) = mapping.get("candidateNames").and_then(Value::as_array) {
        for (position, candidate) in candidates.iter().enumerate() {
            conn.execute(
                "
                INSERT INTO mapping_candidates(
                  mapping_id, position, candidate_name, candidate_source, occurrences, first_seen_at, last_seen_at, source_file_ids
                )
                VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ",
                params![
                    id,
                    position as i64,
                    text_path(candidate, &["name"]).unwrap_or_default(),
                    text_path(candidate, &["source"]).unwrap_or_else(|| "log".to_string()),
                    number_path(candidate, &["occurrences"]).unwrap_or(1.0) as i64,
                    text_path(candidate, &["firstSeenAt"]),
                    text_path(candidate, &["lastSeenAt"]),
                    json_string_path(candidate, &["sourceFileIds"]),
                ],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn clear_record_tables(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM raid_source_files", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM raid_conflicts", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM kills", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM incoming_damage", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM deaths", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM team_members", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM raids", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM import_history", [])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM source_files", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn database_info(state: &AppState, conn: &Connection) -> Result<Value, String> {
    let count = |table: &str| -> Result<i64, String> {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())
    };
    let schema_version = conn
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| SCHEMA_VERSION.to_string());
    let journal_mode = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
        .unwrap_or_else(|_| "unknown".to_string());
    let db_size = fs::metadata(&state.db_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    Ok(json!({
        "path": state.db_path.to_string_lossy(),
        "folder": state.app_data_dir.to_string_lossy(),
        "filename": DB_FILENAME,
        "schemaVersion": schema_version,
        "dbSize": db_size,
        "journalMode": journal_mode,
        "raidCount": count("raids")?,
        "killCount": count("kills")?,
        "incomingDamageCount": count("incoming_damage")?,
        "deathCount": count("deaths")?,
        "mappingCount": count("mappings")?,
        "unconfirmedMappingCount": conn.query_row("SELECT COUNT(*) FROM mappings WHERE status = 'unconfirmed'", [], |row| row.get::<_, i64>(0)).unwrap_or(0),
        "conflictMappingCount": conn.query_row("SELECT COUNT(*) FROM mappings WHERE status = 'conflict'", [], |row| row.get::<_, i64>(0)).unwrap_or(0),
        "importCount": count("import_history")?
    }))
}

fn query_rows(conn: &Connection, sql: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|error| error.to_string())?;
    let names = stmt
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect::<Vec<_>>();
    let rows = stmt
        .query_map([], |row| {
            let mut object = Map::new();

            for (index, name) in names.iter().enumerate() {
                object.insert(name.clone(), value_ref_to_json(row.get_ref(index)?));
            }

            Ok(Value::Object(object))
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn upsert_row(
    conn: &Connection,
    table: &str,
    key_columns: &[&str],
    columns: Vec<(&'static str, SqlValue)>,
) -> Result<(), String> {
    let names = columns.iter().map(|(name, _)| *name).collect::<Vec<_>>();
    let placeholders = names.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let updates = names
        .iter()
        .filter(|name| !key_columns.contains(name))
        .map(|name| format!("{name} = excluded.{name}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
        names.join(", "),
        placeholders,
        key_columns.join(", "),
        updates
    );
    let values = columns
        .into_iter()
        .map(|(_, value)| value)
        .collect::<Vec<_>>();

    conn.execute(&sql, params_from_iter(values.iter()))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn json_value_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;

    for key in path {
        current = current.get(*key)?;
    }

    if current.is_null() {
        None
    } else {
        Some(current)
    }
}

fn pointer_array<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Vec<Value>> {
    json_value_at(value, path)?.as_array()
}

fn text_path(value: &Value, path: &[&str]) -> Option<String> {
    let current = json_value_at(value, path)?;

    if let Some(text) = current.as_str() {
        return Some(text.to_string());
    }

    if current.is_boolean() || current.is_number() {
        return Some(current.to_string());
    }

    None
}

fn id_path(value: &Value, path: &[&str]) -> Option<String> {
    text_path(value, path)
}

fn json_string_path(value: &Value, path: &[&str]) -> Option<String> {
    json_value_at(value, path).map(Value::to_string)
}

fn number_path(value: &Value, path: &[&str]) -> Option<f64> {
    let current = json_value_at(value, path)?;

    if let Some(number) = current.as_f64() {
        return Some(number);
    }

    current.as_str()?.parse::<f64>().ok()
}

fn bool_path(value: &Value, path: &[&str]) -> Option<i64> {
    let current = json_value_at(value, path)?;

    if let Some(value) = current.as_bool() {
        return Some(if value { 1 } else { 0 });
    }

    if let Some(number) = current.as_i64() {
        return Some(if number == 0 { 0 } else { 1 });
    }

    None
}

fn sql_text_path(value: &Value, path: &[&str]) -> SqlValue {
    text_path(value, path).map_or(SqlValue::Null, SqlValue::Text)
}

fn sql_id_path(value: &Value, path: &[&str]) -> SqlValue {
    id_path(value, path).map_or(SqlValue::Null, SqlValue::Text)
}

fn sql_number_path(value: &Value, path: &[&str]) -> SqlValue {
    match number_path(value, path) {
        Some(number) if number.fract() == 0.0 => SqlValue::Integer(number as i64),
        Some(number) => SqlValue::Real(number),
        None => SqlValue::Null,
    }
}

fn sql_bool_path(value: &Value, path: &[&str]) -> SqlValue {
    bool_path(value, path).map_or(SqlValue::Null, SqlValue::Integer)
}

fn value_ref_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => json!(value),
        ValueRef::Real(value) => json!(value),
        ValueRef::Text(value) => json!(String::from_utf8_lossy(value).to_string()),
        ValueRef::Blob(_) => Value::Null,
    }
}

fn current_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    format!("{seconds}")
}
