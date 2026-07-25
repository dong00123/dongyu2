import { AppError } from '../core/AppError.js';
import {
  addKnowledgeBase,
  addKnowledgeCategory,
  addSupportTicket,
  changeTicketStatus,
  editKnowledgeBase,
  fetchConversationDetail,
  fetchConversations,
  fetchCustomerLogs,
  fetchCustomerStats,
  fetchKnowledgeBase,
  fetchKnowledgeCategories,
  fetchTickets,
  removeKnowledgeBase,
  replyCustomerMessage,
  replyTicket
} from '../services/customerServicePlatformService.js';
import {
  getChannels,
  getConfig,
  getFuncMenu,
  getRobotList,
  getRoles
} from '../services/customerServiceService.js';

export function fetchFuncMenu(req, res) {
  res.json(getFuncMenu());
}

export function fetchKnowledgeList(req, res) {
  res.json(fetchKnowledgeBase(Number(req.query.limit || 50)));
}

export function createKnowledge(req, res) {
  res.json(addKnowledgeBase(req.body || {}));
}

export function updateKnowledgeItem(req, res) {
  res.json(editKnowledgeBase(req.params.id, req.body || {}));
}

export function deleteKnowledgeItem(req, res) {
  res.json(removeKnowledgeBase(req.params.id));
}

export function fetchKnowledgeCategoryList(req, res) {
  res.json(fetchKnowledgeCategories());
}

export function createKnowledgeCategory(req, res) {
  res.json(addKnowledgeCategory(req.body || {}));
}

export function fetchRobots(req, res) {
  res.json(getRobotList());
}

export function fetchChannels(req, res) {
  res.json(getChannels());
}

export function fetchTickets(req, res) {
  res.json(fetchTickets(Number(req.query.limit || 50)));
}

export function createSupportTicket(req, res) {
  res.json(addSupportTicket(req.body || {}));
}

export function updateSupportTicketStatus(req, res) {
  res.json(changeTicketStatus(req.params.id, req.body || {}));
}

export function createTicketReply(req, res) {
  res.json(replyTicket(req.params.id, req.body || {}));
}

export async function createCustomerReply(req, res) {
  res.json(await replyCustomerMessage(req.body || {}));
}

export function fetchConversationList(req, res) {
  res.json(fetchConversations(Number(req.query.limit || 30)));
}

export function fetchConversation(req, res) {
  res.json(fetchConversationDetail(req.params.id));
}

export function fetchDashboard(req, res) {
  res.json(fetchCustomerStats());
}

export function fetchConfig(req, res) {
  res.json(getConfig());
}

export function fetchRoles(req, res) {
  res.json(getRoles());
}

export function fetchLogs(req, res) {
  res.json(fetchCustomerLogs(Number(req.query.limit || 50)));
}

export function submitSatisfaction(req, res) {
  const { score } = req.body || {};
  if (!score) throw new AppError('满意度评分不能为空', 400);
  res.json({ msg: '满意度评价已记录', score });
}
