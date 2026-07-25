import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.js';

const dataDir = path.join(env.projectRoot, 'data');
const dbPath = path.join(dataDir, 'dongyu.sqlite');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    nickname TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    auth_type TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    raw_profile TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider, provider_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS travel_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    start_city TEXT NOT NULL,
    end_city TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    person_num TEXT DEFAULT '',
    budget TEXT DEFAULT '',
    req_type TEXT DEFAULT 'full',
    pref TEXT DEFAULT '',
    plan_html TEXT DEFAULT '',
    meta_json TEXT DEFAULT '',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT '',
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_kind TEXT NOT NULL DEFAULT 'unknown',
    storage_ref TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'uploaded',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS multimodal_tasks (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    user_id TEXT DEFAULT '',
    task_type TEXT NOT NULL DEFAULT 'structured_extract',
    scenario TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT DEFAULT '',
    cost_json TEXT DEFAULT '',
    log_json TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS multimodal_results (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    raw_text TEXT DEFAULT '',
    structured_json TEXT DEFAULT '',
    suggestions_json TEXT DEFAULT '',
    redacted_json TEXT DEFAULT '',
    model TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES multimodal_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );
`);

export function getDb() {
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
