mod exec;
mod secrets;

use tauri_plugin_sql::{Migration, MigrationKind};

/// Local-first storage: resumes, sessions, transcripts, threads, reports.
/// Nothing leaves the machine except the provider calls the user's own key
/// pays for.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "core interview schema",
        sql: r#"
            CREATE TABLE IF NOT EXISTS resumes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                raw_text TEXT NOT NULL,
                parsed_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                config_json TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT
            );
            CREATE TABLE IF NOT EXISTS turns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                stage TEXT,
                ts TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                stage TEXT NOT NULL,
                topic TEXT NOT NULL,
                depth INTEGER NOT NULL,
                exhausted INTEGER NOT NULL,
                assessments_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
                report_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
            CREATE INDEX IF NOT EXISTS idx_threads_session ON threads(session_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_resume ON sessions(resume_id);
        "#,
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:interview.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            secrets::set_api_key,
            secrets::get_api_key,
            secrets::delete_api_key,
            secrets::has_api_key,
            exec::run_code,
            exec::available_languages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
