import { createId, getDb, nowIso } from '../data/database.js';

const db = getDb();

const insertFileStmt = db.prepare(`
  INSERT INTO files (id, user_id, file_name, file_type, file_size, file_kind, storage_ref, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTaskStmt = db.prepare(`
  INSERT INTO multimodal_tasks (id, file_id, user_id, task_type, scenario, status, retry_count, error_message, cost_json, log_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertResultStmt = db.prepare(`
  INSERT INTO multimodal_results (id, task_id, file_id, raw_text, structured_json, suggestions_json, redacted_json, model, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateTaskStmt = db.prepare(`
  UPDATE multimodal_tasks
  SET status = ?, retry_count = ?, error_message = ?, cost_json = ?, log_json = ?, updated_at = ?
  WHERE id = ?
`);

const listTasksStmt = db.prepare(`
  SELECT
    mt.*,
    f.file_name,
    f.file_type,
    f.file_size,
    f.file_kind,
    mr.raw_text,
    mr.structured_json,
    mr.suggestions_json,
    mr.redacted_json,
    mr.model AS result_model
  FROM multimodal_tasks mt
  JOIN files f ON f.id = mt.file_id
  LEFT JOIN multimodal_results mr ON mr.task_id = mt.id
  ORDER BY mt.created_at DESC
  LIMIT ?
`);

const getTaskStmt = db.prepare(`
  SELECT
    mt.*,
    f.file_name,
    f.file_type,
    f.file_size,
    f.file_kind,
    mr.raw_text,
    mr.structured_json,
    mr.suggestions_json,
    mr.redacted_json,
    mr.model AS result_model
  FROM multimodal_tasks mt
  JOIN files f ON f.id = mt.file_id
  LEFT JOIN multimodal_results mr ON mr.task_id = mt.id
  WHERE mt.id = ?
`);

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    fileId: row.file_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    fileKind: row.file_kind,
    taskType: row.task_type,
    scenario: row.scenario,
    status: row.status,
    retryCount: row.retry_count,
    errorMessage: row.error_message,
    cost: parseJson(row.cost_json, {}),
    logs: parseJson(row.log_json, []),
    rawText: row.raw_text || '',
    structured: parseJson(row.structured_json, {}),
    suggestions: parseJson(row.suggestions_json, []),
    redacted: parseJson(row.redacted_json, {}),
    model: row.result_model || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createMultimodalFile(payload) {
  const id = createId('file');
  const now = nowIso();
  insertFileStmt.run(
    id,
    payload.userId || '',
    payload.fileName,
    payload.fileType,
    payload.fileSize || 0,
    payload.fileKind || 'unknown',
    payload.storageRef || '',
    payload.status || 'uploaded',
    now,
    now
  );
  return id;
}

export function createMultimodalTask(payload) {
  const id = createId('mmt');
  const now = nowIso();
  insertTaskStmt.run(
    id,
    payload.fileId,
    payload.userId || '',
    payload.taskType || 'structured_extract',
    payload.scenario || 'general',
    payload.status || 'pending',
    payload.retryCount || 0,
    payload.errorMessage || '',
    JSON.stringify(payload.cost || {}),
    JSON.stringify(payload.logs || []),
    now,
    now
  );
  return id;
}

export function updateMultimodalTask(taskId, payload) {
  updateTaskStmt.run(
    payload.status,
    payload.retryCount || 0,
    payload.errorMessage || '',
    JSON.stringify(payload.cost || {}),
    JSON.stringify(payload.logs || []),
    nowIso(),
    taskId
  );
}

export function createMultimodalResult(payload) {
  const id = createId('mmr');
  const now = nowIso();
  insertResultStmt.run(
    id,
    payload.taskId,
    payload.fileId,
    payload.rawText || '',
    JSON.stringify(payload.structured || {}),
    JSON.stringify(payload.suggestions || []),
    JSON.stringify(payload.redacted || {}),
    payload.model || '',
    now,
    now
  );
  return id;
}

export function listMultimodalTasks(limit = 20) {
  return listTasksStmt.all(limit).map(mapTask);
}

export function getMultimodalTask(taskId) {
  return mapTask(getTaskStmt.get(taskId));
}
