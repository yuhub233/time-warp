const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_records (
    date TEXT PRIMARY KEY,
    real_wake_time TEXT,
    real_sleep_time TEXT,
    irregular_wake_time TEXT,
    irregular_sleep_time TEXT,
    real_wake_ts INTEGER,
    real_sleep_ts INTEGER,
    target_entertainment_min INTEGER,
    target_study_min INTEGER,
    actual_entertainment_min REAL DEFAULT 0,
    actual_study_min REAL DEFAULT 0,
    entertainment_speed REAL,
    status TEXT DEFAULT 'awake'
  );

  CREATE TABLE IF NOT EXISTS pomodoro_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_real_time TEXT NOT NULL,
    end_real_time TEXT,
    start_irregular_time TEXT,
    end_irregular_time TEXT,
    planned_duration_min INTEGER,
    actual_real_duration_min REAL,
    actual_irregular_duration_min REAL,
    break_count INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    activity TEXT NOT NULL,
    device TEXT,
    app_name TEXT
  );

  CREATE TABLE IF NOT EXISTS ai_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    period TEXT NOT NULL,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS time_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    real_time TEXT NOT NULL,
    irregular_time TEXT NOT NULL,
    speed REAL NOT NULL,
    activity TEXT
  );
`);

function getSetting(key, defaultValue) {
  const row = db.prepare('SELECT value FROM user_settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

function initDefaults(config) {
  const defaults = {
    targetWakeTime: '07:00',
    targetSleepTime: '23:00',
    targetEntertainmentMin: 120,
    targetStudyMin: 240,
    pomodoroWorkMin: 25,
    pomodoroBreakMin: 5,
    pomodoroLongBreakMin: 15,
    pomodoroSessionsBeforeLong: 4,
    studySpeedStart: 5.0,
    studySpeedEnd: 0.3,
    idleSpeed: 0.5,
    convergenceRate: config.convergenceRate || 0.3,
    floatingWindowSize: 48,
    floatingWindowBgColor: '#000000',
    floatingWindowTextColor: '#00FF00',
    entertainmentApps: ['com.tencent.mm', 'com.tencent.mobileqq', 'com.ss.android.ugc.aweme', 'tv.danmaku.bili'],
    fullscreenOrientation: 'landscape',
    entertainmentWarningThreshold: 0.9
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) === undefined) setSetting(k, v);
  }
}

module.exports = { db, getSetting, setSetting, initDefaults };
