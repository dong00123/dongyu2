import { createId, getDb, nowIso } from '../data/database.js';

const db = getDb();

const insertConversationStmt = db.prepare(`
  INSERT INTO conversations (id, user_id, user_name, user_identity, category, status, context_json, satisfaction, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (id, conversation_id, sender_type, sender_name, content, intent, confidence, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateConversationStmt = db.prepare(`
  UPDATE conversations SET category = ?, status = ?, context_json = ?, satisfaction = ?, updated_at = ? WHERE id = ?
`);

const listConversationsStmt = db.prepare(`
  SELECT c.*, COUNT(m.id) AS message_count
  FROM conversations c
  LEFT JOIN messages m ON m.conversation_id = c.id
  GROUP BY c.id
  ORDER BY c.updated_at DESC
  LIMIT ?
`);

const getConversationStmt = db.prepare(`SELECT * FROM conversations WHERE id = ?`);
const listMessagesStmt = db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`);

const insertCategoryStmt = db.prepare(`
  INSERT INTO knowledge_categories (id, name, description, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const listCategoriesStmt = db.prepare(`SELECT * FROM knowledge_categories ORDER BY created_at DESC`);

const insertKnowledgeStmt = db.prepare(`
  INSERT INTO knowledge_base (id, category_id, question, answer, status, version, tags, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateKnowledgeStmt = db.prepare(`
  UPDATE knowledge_base SET category_id = ?, question = ?, answer = ?, status = ?, version = version + 1, tags = ?, updated_at = ? WHERE id = ?
`);

const deleteKnowledgeStmt = db.prepare(`DELETE FROM knowledge_base WHERE id = ?`);
const listKnowledgeStmt = db.prepare(`
  SELECT kb.*, kc.name AS category_name
  FROM knowledge_base kb
  LEFT JOIN knowledge_categories kc ON kc.id = kb.category_id
  ORDER BY kb.updated_at DESC
  LIMIT ?
`);

const insertTicketStmt = db.prepare(`
  INSERT INTO support_tickets (id, conversation_id, user_name, category, title, content, status, assignee, priority, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateTicketStatusStmt = db.prepare(`
  UPDATE support_tickets SET status = ?, assignee = ?, updated_at = ? WHERE id = ?
`);

const listTicketsStmt = db.prepare(`SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT ?`);

const insertTicketReplyStmt = db.prepare(`
  INSERT INTO ticket_replies (id, ticket_id, replier_type, replier_name, content, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const listTicketRepliesStmt = db.prepare(`SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC`);

const insertLogStmt = db.prepare(`
  INSERT INTO customer_service_logs (id, action, target_type, target_id, detail, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const listLogsStmt = db.prepare(`SELECT * FROM customer_service_logs ORDER BY created_at DESC LIMIT ?`);
const hotQuestionStmt = db.prepare(`SELECT intent, COUNT(*) AS total FROM messages WHERE sender_type = 'user' GROUP BY intent ORDER BY total DESC LIMIT 8`);
const unresolvedStmt = db.prepare(`SELECT * FROM support_tickets WHERE status IN ('待处理', '处理中') ORDER BY updated_at DESC LIMIT 8`);

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapConversation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userIdentity: row.user_identity,
    category: row.category,
    status: row.status,
    context: parseJson(row.context_json, {}),
    satisfaction: row.satisfaction,
    messageCount: row.message_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapKnowledge(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name || '',
    question: row.question,
    answer: row.answer,
    status: row.status,
    version: row.version,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function addLog(action, targetType, targetId, detail) {
  insertLogStmt.run(createId('csl'), action, targetType || '', targetId || '', detail || '', nowIso());
}

export function createConversation(payload) {
  const id = createId('conv');
  const now = nowIso();
  insertConversationStmt.run(
    id,
    payload.userId || '',
    payload.userName || '访客用户',
    payload.userIdentity || '网页访客',
    payload.category || '咨询',
    payload.status || '进行中',
    JSON.stringify(payload.context || {}),
    payload.satisfaction || 0,
    now,
    now
  );
  addLog('创建会话', 'conversation', id, payload.userName || '访客用户');
  return id;
}

export function addMessage(payload) {
  const id = createId('msg');
  insertMessageStmt.run(
    id,
    payload.conversationId,
    payload.senderType,
    payload.senderName || '',
    payload.content,
    payload.intent || '',
    payload.confidence || 0,
    nowIso()
  );
  return id;
}

export function updateConversation(payload) {
  updateConversationStmt.run(
    payload.category,
    payload.status,
    JSON.stringify(payload.context || {}),
    payload.satisfaction || 0,
    nowIso(),
    payload.id
  );
}

export function getConversation(id) {
  const row = getConversationStmt.get(id);
  return row ? mapConversation(row) : null;
}

export function listConversations(limit = 20) {
  return listConversationsStmt.all(limit).map(mapConversation);
}

export function listMessages(conversationId) {
  return listMessagesStmt.all(conversationId).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    senderName: row.sender_name,
    content: row.content,
    intent: row.intent,
    confidence: row.confidence,
    createdAt: row.created_at
  }));
}

export function createKnowledgeCategory(name, description = '') {
  const id = createId('kcat');
  const now = nowIso();
  insertCategoryStmt.run(id, name, description, now, now);
  addLog('新增知识分类', 'knowledge_category', id, name);
  return id;
}

export function listKnowledgeCategories() {
  return listCategoriesStmt.all().map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function createKnowledge(payload) {
  const id = createId('kb');
  const now = nowIso();
  insertKnowledgeStmt.run(
    id,
    payload.categoryId || null,
    payload.question,
    payload.answer,
    payload.status || '待审核',
    1,
    (payload.tags || []).join(','),
    now,
    now
  );
  addLog('新增知识', 'knowledge', id, payload.question);
  return id;
}

export function updateKnowledge(id, payload) {
  updateKnowledgeStmt.run(
    payload.categoryId || null,
    payload.question,
    payload.answer,
    payload.status || '待审核',
    (payload.tags || []).join(','),
    nowIso(),
    id
  );
  addLog('更新知识', 'knowledge', id, payload.question);
}

export function deleteKnowledge(id) {
  deleteKnowledgeStmt.run(id);
  addLog('删除知识', 'knowledge', id, '删除知识条目');
}

export function listKnowledge(limit = 50) {
  return listKnowledgeStmt.all(limit).map(mapKnowledge);
}

export function createTicket(payload) {
  const id = createId('ticket');
  const now = nowIso();
  insertTicketStmt.run(
    id,
    payload.conversationId || null,
    payload.userName || '访客用户',
    payload.category || '咨询',
    payload.title || '待人工处理问题',
    payload.content,
    payload.status || '待处理',
    payload.assignee || '',
    payload.priority || '普通',
    now,
    now
  );
  addLog('创建工单', 'ticket', id, payload.content);
  return id;
}

export function updateTicketStatus(id, status, assignee = '') {
  updateTicketStatusStmt.run(status, assignee, nowIso(), id);
  addLog('更新工单状态', 'ticket', id, status);
}

export function listTickets(limit = 50) {
  return listTicketsStmt.all(limit).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    userName: row.user_name,
    category: row.category,
    title: row.title,
    content: row.content,
    status: row.status,
    assignee: row.assignee,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replies: listTicketRepliesStmt.all(row.id)
  }));
}

export function addTicketReply(payload) {
  const id = createId('treply');
  insertTicketReplyStmt.run(
    id,
    payload.ticketId,
    payload.replierType || 'agent',
    payload.replierName || '人工客服',
    payload.content,
    nowIso()
  );
  addLog('新增工单回复', 'ticket', payload.ticketId, payload.content);
  return id;
}

export function getStats() {
  const conversations = listConversations(1000);
  const tickets = listTickets(1000);
  return {
    totalConversations: conversations.length,
    openTickets: tickets.filter((item) => ['待处理', '处理中'].includes(item.status)).length,
    solvedTickets: tickets.filter((item) => item.status === '已解决').length,
    avgResponseTime: '即时响应',
    hotQuestions: hotQuestionStmt.all(),
    unresolvedTickets: unresolvedStmt.all()
  };
}

export function listCustomerServiceLogs(limit = 50) {
  return listLogsStmt.all(limit).map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    createdAt: row.created_at
  }));
}
