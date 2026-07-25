import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';
import { askAssistant } from '../ai/chatCompletionService.js';
import {
  createMultimodalFile,
  createMultimodalResult,
  createMultimodalTask,
  getMultimodalTask,
  listMultimodalTasks,
  updateMultimodalTask
} from '../../repositories/multimodalRepository.js';

function inferFileKind(fileType, fileName = '') {
  const name = fileName.toLowerCase();
  if (fileType?.startsWith('image/')) return 'image';
  if (fileType?.startsWith('audio/')) return 'audio';
  if (fileType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.includes('截图') || name.includes('screenshot')) return 'screenshot';
  return 'unknown';
}

function inferScenario(fileName = '', userPrompt = '') {
  const text = `${fileName} ${userPrompt}`;
  if (/订单|order|金额|支付|机票|火车票|行程/i.test(text)) return 'travel_order';
  if (/酒店|hotel|民宿|住宿|评分|地址/i.test(text)) return 'hotel';
  if (/客服|聊天|投诉|售后|退款|咨询/i.test(text)) return 'customer_chat';
  return 'general';
}

function redactSensitiveText(text = '') {
  return text
    .replace(/1[3-9]\d{9}/g, '手机号[已脱敏]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '邮箱[已脱敏]')
    .replace(/\b\d{15}(?:\d{2}[0-9Xx])?\b/g, '身份证[已脱敏]')
    .replace(/\b\d{12,32}\b/g, '长号码[已脱敏]');
}

function buildPrompt({ fileKind, scenario, userPrompt }) {
  return `你是多模态结构化处理中心，请对用户上传的${fileKind}进行 OCR、图像内容识别、信息抽取和敏感信息脱敏。

业务场景: ${scenario}
用户补充要求: ${userPrompt || '无'}

请严格返回 JSON，不要输出 Markdown。JSON 结构如下：
{
  "rawText": "OCR或可见文字原文，无法识别时写空字符串",
  "visualSummary": "图像、PDF、语音或截图内容摘要",
  "structured": {
    "documentType": "travel_order | hotel | customer_chat | general",
    "dates": [],
    "locations": [],
    "amounts": [],
    "orderNumbers": [],
    "hotelName": "",
    "address": "",
    "rating": "",
    "customerIssueSummary": "",
    "entities": [],
    "keyValues": {}
  },
  "suggestions": ["AI建议1", "AI建议2"],
  "sensitiveFields": ["被脱敏字段说明"],
  "confidence": "高 | 中 | 低"
}

抽取要求：
1. 旅游订单截图重点提取日期、地点、金额、订单号。
2. 酒店截图重点提取酒店名、地址、评分。
3. 客服聊天截图重点提取问题摘要、诉求、情绪和下一步处理建议。
4. 返回原始识别结果、结构化字段和 AI 建议。
5. 对手机号、邮箱、身份证、超长订单号等敏感信息进行脱敏说明。`;
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function estimateCost(inputText, outputText) {
  const inputTokens = Math.ceil(String(inputText || '').length / 2);
  const outputTokens = Math.ceil(String(outputText || '').length / 2);
  return {
    model: env.bwaiModel,
    inputTokens,
    outputTokens,
    estimatedTotalTokens: inputTokens + outputTokens,
    estimatedCostCny: Number(((inputTokens + outputTokens) * 0.000002).toFixed(6))
  };
}

function normalizeResult(answer, prompt) {
  const parsed = extractJson(answer) || {};
  const rawText = parsed.rawText || answer || '';
  const redactedText = redactSensitiveText(rawText);
  const structured = parsed.structured || {};

  return {
    rawText,
    structured: {
      documentType: structured.documentType || 'general',
      dates: structured.dates || [],
      locations: structured.locations || [],
      amounts: structured.amounts || [],
      orderNumbers: structured.orderNumbers || [],
      hotelName: structured.hotelName || '',
      address: structured.address || '',
      rating: structured.rating || '',
      customerIssueSummary: structured.customerIssueSummary || '',
      entities: structured.entities || [],
      keyValues: structured.keyValues || {},
      visualSummary: parsed.visualSummary || '',
      confidence: parsed.confidence || '中'
    },
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : ['请人工复核关键金额、日期和订单号。'],
    redacted: {
      rawText: redactedText,
      sensitiveFields: parsed.sensitiveFields || []
    },
    cost: estimateCost(prompt, answer)
  };
}

export async function processMultimodalFile(payload) {
  const { fileName, fileType, fileSize, fileBase64, userPrompt } = payload;
  if (!fileBase64?.trim()) {
    throw new AppError('上传文件内容不能为空', 400);
  }

  const fileKind = inferFileKind(fileType, fileName);
  const scenario = payload.scenario || inferScenario(fileName, userPrompt);
  const logs = [{ time: new Date().toISOString(), message: '已创建多模态处理任务' }];
  const fileId = createMultimodalFile({
    userId: payload.userId,
    fileName,
    fileType,
    fileSize,
    fileKind,
    storageRef: 'base64-in-request',
    status: 'uploaded'
  });
  const taskId = createMultimodalTask({
    fileId,
    userId: payload.userId,
    scenario,
    status: 'processing',
    logs
  });

  try {
    const prompt = buildPrompt({ fileKind, scenario, userPrompt });
    logs.push({ time: new Date().toISOString(), message: '开始调用多模态模型' });
    const result = await askAssistant({ query: prompt, imageBase64: fileBase64 });
    logs.push({ time: new Date().toISOString(), message: '模型调用完成，开始结构化解析' });
    const normalized = normalizeResult(result.answer, prompt);
    createMultimodalResult({
      taskId,
      fileId,
      rawText: normalized.rawText,
      structured: normalized.structured,
      suggestions: normalized.suggestions,
      redacted: normalized.redacted,
      model: result.model
    });
    updateMultimodalTask(taskId, {
      status: 'completed',
      retryCount: 0,
      cost: normalized.cost,
      logs
    });
    return getMultimodalTask(taskId);
  } catch (error) {
    logs.push({ time: new Date().toISOString(), message: `处理失败：${error.message}` });
    updateMultimodalTask(taskId, {
      status: 'failed',
      retryCount: 0,
      errorMessage: error.message || '处理失败',
      logs
    });
    return getMultimodalTask(taskId);
  }
}

export function getMultimodalTasks(limit) {
  return listMultimodalTasks(limit);
}

export function getMultimodalTaskDetail(taskId) {
  return getMultimodalTask(taskId);
}
