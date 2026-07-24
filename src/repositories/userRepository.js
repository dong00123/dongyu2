import { createId, getDb, nowIso } from '../data/database.js';

const db = getDb();

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, email, password_hash, nickname, avatar, auth_type, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const findUserByEmailStmt = db.prepare(`
  SELECT * FROM users WHERE email = ?
`);

const findUserByIdStmt = db.prepare(`
  SELECT * FROM users WHERE id = ?
`);

const insertOauthStmt = db.prepare(`
  INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, raw_profile, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateOauthStmt = db.prepare(`
  UPDATE oauth_accounts
  SET raw_profile = ?, updated_at = ?
  WHERE provider = ? AND provider_user_id = ?
`);

const findOauthAccountStmt = db.prepare(`
  SELECT oa.*, u.nickname, u.avatar, u.email, u.auth_type
  FROM oauth_accounts oa
  JOIN users u ON u.id = oa.user_id
  WHERE oa.provider = ? AND oa.provider_user_id = ?
`);

const updateUserProfileStmt = db.prepare(`
  UPDATE users
  SET nickname = ?, avatar = ?, updated_at = ?
  WHERE id = ?
`);

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email || '',
    nickname: row.nickname,
    avatar: row.avatar || '',
    authType: row.auth_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createLocalUser({ email, passwordHash, nickname }) {
  const id = createId('usr');
  const now = nowIso();
  insertUserStmt.run(id, email, passwordHash, nickname, '', 'local', now, now);
  return findUserById(id);
}

export function findUserByEmail(email) {
  const row = findUserByEmailStmt.get(email);
  return row
    ? {
        ...mapUser(row),
        passwordHash: row.password_hash
      }
    : null;
}

export function findUserById(id) {
  return mapUser(findUserByIdStmt.get(id));
}

export function findOrCreateOauthUser(profile) {
  const existingAccount = findOauthAccountStmt.get(profile.provider, profile.providerUserId);
  const now = nowIso();

  if (existingAccount) {
    updateOauthStmt.run(JSON.stringify(profile.rawProfile || {}), now, profile.provider, profile.providerUserId);
    updateUserProfileStmt.run(profile.nickname, profile.avatar || '', now, existingAccount.user_id);
    return findUserById(existingAccount.user_id);
  }

  const userId = createId('usr');
  insertUserStmt.run(
    userId,
    '',
    '',
    profile.nickname,
    profile.avatar || '',
    profile.provider,
    now,
    now
  );

  insertOauthStmt.run(
    createId('oauth'),
    userId,
    profile.provider,
    profile.providerUserId,
    JSON.stringify(profile.rawProfile || {}),
    now,
    now
  );

  return findUserById(userId);
}
