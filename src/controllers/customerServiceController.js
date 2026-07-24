import { AppError } from '../core/AppError.js';
import {
  addKnowledge,
  createTicket,
  getChannels,
  getConfig,
  getDashboardData,
  getFuncMenu,
  getKnowledgeList,
  getLogs,
  getRobotList,
  getRoles,
  getTickets
} from '../services/customerServiceService.js';

export function fetchFuncMenu(req, res) {
  res.json(getFuncMenu());
}

export function fetchKnowledgeList(req, res) {
  res.json(getKnowledgeList());
}

export function createKnowledge(req, res) {
  const { question, answer } = req.body || {};
  if (!question || !answer) {
    throw new AppError('问题和答案不能为空', 400);
  }

  res.json(addKnowledge(question, answer));
}

export function fetchRobots(req, res) {
  res.json(getRobotList());
}

export function fetchChannels(req, res) {
  res.json(getChannels());
}

export function fetchTickets(req, res) {
  res.json(getTickets());
}

export function createSupportTicket(req, res) {
  const { userName, content } = req.body || {};
  if (!userName || !content) {
    throw new AppError('用户和工单内容不能为空', 400);
  }

  res.json(createTicket(userName, content));
}

export function fetchDashboard(req, res) {
  res.json(getDashboardData());
}

export function fetchConfig(req, res) {
  res.json(getConfig());
}

export function fetchRoles(req, res) {
  res.json(getRoles());
}

export function fetchLogs(req, res) {
  res.json(getLogs());
}
