import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(__dirname, '..');
const dbPath = join(dataDir, 'app.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'student',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    answer INTEGER NOT NULL,
    topic INTEGER NOT NULL,
    section_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    topic INTEGER NOT NULL,
    score INTEGER NOT NULL,
    is_perfect INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL REFERENCES quiz_rounds(id),
    question_id TEXT NOT NULL REFERENCES questions(id),
    selected INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,
    answer_order TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    topic INTEGER NOT NULL,
    reward_type TEXT NOT NULL,
    unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, topic, reward_type)
  );

  CREATE INDEX IF NOT EXISTS idx_quiz_rounds_user ON quiz_rounds(user_id);
  CREATE INDEX IF NOT EXISTS idx_quiz_rounds_user_topic ON quiz_rounds(user_id, topic);
  CREATE INDEX IF NOT EXISTS idx_quiz_answers_round ON quiz_answers(round_id);
  CREATE INDEX IF NOT EXISTS idx_quiz_answers_question ON quiz_answers(question_id);
  CREATE INDEX IF NOT EXISTS idx_rewards_user ON rewards(user_id);
`);

// Migration: add is_retrain column
try {
  db.exec(`ALTER TABLE quiz_rounds ADD COLUMN is_retrain INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // Column already exists
}

// Migration: add cohort column to users
try {
  db.exec(`ALTER TABLE users ADD COLUMN cohort TEXT`);
} catch (e) {
  // Column already exists
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_users_cohort ON users(cohort)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cohorts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
