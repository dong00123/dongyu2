import { AppError } from '../core/AppError.js';
import { askAssistant } from '../services/ai/chatCompletionService.js';

export async function createAssistantReply(req, res) {
  const { query, imageBase64 } = req.body || {};

  if (!query?.trim()) {
    throw new AppError('搜索内容不能为空', 400);
  }

  const result = await askAssistant({ query, imageBase64 });
  res.json({
    answer: result.answer,
    model: result.model
  });
}
