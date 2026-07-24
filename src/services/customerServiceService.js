import { customerServiceData } from '../data/mock/customerServiceData.js';
import { env } from '../config/env.js';

export function getFuncMenu() {
  return customerServiceData.funcMenu;
}

export function getKnowledgeList() {
  return { list: customerServiceData.knowledgeList };
}

export function addKnowledge(question, answer) {
  return {
    code: 0,
    msg: '知识添加成功',
    data: { question, answer }
  };
}

export function getRobotList() {
  return {
    robots: customerServiceData.robots.map((item) => ({
      ...item,
      model: env.bwaiModel
    }))
  };
}

export function getChannels() {
  return { channels: customerServiceData.channels };
}

export function getTickets() {
  return { list: customerServiceData.tickets };
}

export function createTicket(userName, content) {
  return {
    code: 0,
    ticketId: `TK${Date.now()}`,
    msg: '工单创建成功，客服将尽快处理',
    data: { userName, content }
  };
}

export function getDashboardData() {
  return customerServiceData.dashboard;
}

export function getConfig() {
  return {
    ...customerServiceData.config,
    modelName: env.bwaiModel
  };
}

export function getRoles() {
  return { roles: customerServiceData.roles };
}

export function getLogs() {
  return { logs: customerServiceData.logs };
}
