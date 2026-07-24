import { createId, getDb, nowIso } from '../data/database.js';

const db = getDb();

const insertHistoryStmt = db.prepare(`
  INSERT INTO travel_history (
    id, user_id, start_city, end_city, start_date, end_date, person_num, budget, req_type, pref,
    plan_html, meta_json, is_favorite, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listHistoryStmt = db.prepare(`
  SELECT * FROM travel_history
  WHERE user_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const updateFavoriteStmt = db.prepare(`
  UPDATE travel_history
  SET is_favorite = ?, updated_at = ?
  WHERE id = ? AND user_id = ?
`);

export function createTravelHistory(userId, payload, result) {
  const id = createId('trip');
  const now = nowIso();
  insertHistoryStmt.run(
    id,
    userId,
    payload.startCity,
    payload.endCity,
    payload.startDate,
    payload.endDate,
    payload.personNum || '',
    payload.budget || '',
    payload.reqType || 'full',
    payload.pref || '',
    result.html || '',
    JSON.stringify(result.meta || {}),
    0,
    now,
    now
  );
  return id;
}

export function listTravelHistory(userId, limit = 20) {
  return listHistoryStmt.all(userId, limit).map((row) => ({
    id: row.id,
    startCity: row.start_city,
    endCity: row.end_city,
    startDate: row.start_date,
    endDate: row.end_date,
    personNum: row.person_num,
    budget: row.budget,
    reqType: row.req_type,
    pref: row.pref,
    planHtml: row.plan_html,
    meta: row.meta_json ? JSON.parse(row.meta_json) : {},
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function setFavoriteTravelHistory(userId, historyId, favorite) {
  updateFavoriteStmt.run(favorite ? 1 : 0, nowIso(), historyId, userId);
}
