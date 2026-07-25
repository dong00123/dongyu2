import { env } from '../config/env.js';
import { AppError } from '../core/AppError.js';
import { askAssistant } from './ai/chatCompletionService.js';
import {
  addMessage,
  addTicketReply,
  createConversation,
  createKnowledge,
  createKnowledgeCategory,
  createTicket,
  deleteKnowledge,
  getConversation,
  getStats,
  listConversations,
  listCustomerServiceLogs,
  listKnowledge,
  listKnowledgeCategories,
  listMessages,
  listTickets,
  updateConversation,
  updateKnowledge,
  updateTicketStatus
} from '../repositories/customerServicePlatformRepository.js';

function classifyConversation(text = '') {
  if (/退款|退货|退钱|退费/.test(text)) return '退款';
  if (/投诉|差评|不满意|态度|举报/.test(text)) return '投诉';
  if (/售后|维修|坏了|破损|换货/.test(text)) return '售后';
  if (/价格|优惠|怎么买|推荐|功能|套餐/.test(text)) return '售前';
  return '咨询';
}

function findKnowledgeAnswer(question) {
  const normalized = String(question || '').trim();
  const list = listKnowledge(100).filter((item) => item.status === '已审核');
  return list.find((item) => normalized.includes(item.question) || item.question.includes(normalized));
}

function shouldTransferToTicket(answer = '', question = '') {
  return /不知道|无法|不确定|人工|投诉|严重|赔偿|退款失败/.test(`${answer} ${question}`);
}

function buildContextText(messages) {
  return messages.slice(-8).map((item) => `${item.senderType === 'user' ? '用户' : '客服'}：${item.content}`).join('\n');
}

export async function replyCustomerMessage(payload) {
  const userName = payload.userName || '访客用户';
  const userIdentity = payload.userIdentity || '网页访客';
  const question = String(payload.content || '').trim();

  if (!question) {
    throw new AppError('消息内容不能为空', 400);
  }

  let conversationId = payload.conversationId;
  let conversation = conversationId ? getConversation(conversationId) : null;
  const category = classifyConversation(question);

  if (!conversation) {
    conversationId = createConversation({ userName, userIdentity, category, context: { lastIntent: category } });
    conversation = getConversation(conversationId);
  }

  addMessage({ conversationId, senderType: 'user', senderName: userName, content: question, intent: category, confidence: 0.86 });

  const messages = listMessages(conversationId);
  const matchedKnowledge = findKnowledgeAnswer(question);
  let answer = '';
  let source = 'ai';

  if (matchedKnowledge) {
    answer = matchedKnowledge.answer;
    source = 'knowledge_base';
  } else {
    const aiResult = await askAssistant({
      query: `你是 AI 客服平台，具备会话上下文记忆、用户身份识别、会话分类和无法回答自动转工单能力。\n当前用户：${userName}（${userIdentity}）\n会话分类：${category}\n最近上下文：\n${buildContextText(messages)}\n请用中文给出客服回复。如果无法确定，请明确建议转人工工单。\n用户最新问题：${question}`
    });
    answer = aiResult.answer || '这个问题需要人工客服进一步确认，我已为你转工单。';
  }

  let ticketId = '';
  if (shouldTransferToTicket(answer, question)) {
    ticketId = createTicket({
      conversationId,
      userName,
      category,
      title: `${category}问题需人工处理`,
      content: question,
      status: '待处理',
      priority: category === '投诉' ? '高' : '普通'
    });
    answer += `\n\n我已为你自动创建工单：${ticketId}，人工客服会继续跟进。`;
    source = `${source}+ticket`;
  }

  addMessage({ conversationId, senderType: 'assistant', senderName: 'AI客服', content: answer, intent: category, confidence: source.includes('knowledge') ? 0.95 : 0.78 });
  updateConversation({
    id: conversationId,
    category,
    status: ticketId ? '已转工单' : '进行中',
    context: { lastIntent: category, source, ticketId },
    satisfaction: conversation?.satisfaction || 0
  });

  return {
    conversationId,
    category,
    answer,
    source,
    ticketId,
    messages: listMessages(conversationId)
  };
}

export function fetchConversations(limit) {
  return { items: listConversations(limit) };
}

export function fetchConversationDetail(id) {
  const conversation = getConversation(id);
  if (!conversation) throw new AppError('会话不存在', 404);
  return { ...conversation, messages: listMessages(id) };
}

export function fetchKnowledgeCategories() {
  return { items: listKnowledgeCategories() };
}

export function addKnowledgeCategory(payload) {
  if (!payload.name) throw new AppError('分类名称不能为空', 400);
  const id = createKnowledgeCategory(payload.name, payload.description || '');
  return { id, msg: '知识分类已创建' };
}

export function fetchKnowledgeBase(limit) {
  return { list: listKnowledge(limit) };
}

export function addKnowledgeBase(payload) {
  if (!payload.question || !payload.answer) throw new AppError('问题和答案不能为空', 400);
  const id = createKnowledge({
    categoryId: payload.categoryId,
    question: payload.question,
    answer: payload.answer,
    status: payload.status || '待审核',
    tags: payload.tags || []
  });
  return { id, msg: '知识已创建' };
}

export function editKnowledgeBase(id, payload) {
  updateKnowledge(id, payload);
  return { id, msg: '知识已更新并生成新版本' };
}

export function removeKnowledgeBase(id) {
  deleteKnowledge(id);
  return { id, msg: '知识已删除' };
}

export function fetchTickets(limit) {
  return { list: listTickets(limit) };
}

export function addSupportTicket(payload) {
  if (!payload.userName || !payload.content) throw new AppError('用户和工单内容不能为空', 400);
  const id = createTicket(payload);
  return { ticketId: id, msg: '工单创建成功' };
}

export function changeTicketStatus(id, payload) {
  const allowed = new Set(['待处理', '处理中', '已解决', '已关闭']);
  if (!allowed.has(payload.status)) throw new AppError('工单状态不合法', 400);
  updateTicketStatus(id, payload.status, payload.assignee || '');
  return { id, msg: '工单状态已更新' };
}

export function replyTicket(id, payload) {
  if (!payload.content) throw new AppError('回复内容不能为空', 400);
  const replyId = addTicketReply({
    ticketId: id,
    replierType: payload.replierType || 'agent',
    replierName: payload.replierName || '人工客服',
    content: payload.content
  });
  return { replyId, msg: '工单回复已添加' };
}

export function fetchCustomerStats() {
  return {
    ...getStats(),
    modelName: env.bwaiModel
  };
}

export function fetchCustomerLogs(limit) {
  return { logs: listCustomerServiceLogs(limit) };
}
