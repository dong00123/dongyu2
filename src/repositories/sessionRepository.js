import crypto from 'crypto';
import { getDb, nowIso } from '../data/database.js';
import { findUserById } from './userRepository.js';

const db = getDb();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (token, user_id, expires_at, created_at)
  VALUES (?, ?, ?, ?)
`);

const findSessionStmt = db.prepare(`
  SELECT * FROM sessions WHERE token = ?
`);

const deleteSessionStmt = db.prepare(`
  DELETE FROM sessions WHERE token = ?
`);

const cleanupStmt = db.prepare(`
  DELETE FROM sessions WHERE expires_at <= ?
`);

export function createUserSession(userId) {
  cleanupExpiredSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  insertSessionStmt.run(token, userId, expiresAt, createdAt);
  return {
    token,
    maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
    expiresAt
  };
}

export function getSessionUser(token) {
  cleanupExpiredSessions();
  const session = findSessionStmt.get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    deleteSessionStmt.run(token);
    return null;
  }
  return findUserById(session.user_id);
}

export function deleteSession(token) {
  deleteSessionStmt.run(token);
}

export function cleanupExpiredSessions() {
  cleanupStmt.run(nowIso());
}
