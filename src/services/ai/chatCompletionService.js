import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUpstreamMessage(message, status) {
  const text = String(message || '').trim();

  if (/temporarily unavailable|service unavailable|upstream/i.test(text) || status === 503) {
    return '上游大模型服务临时繁忙，请稍后重新生成';
  }

  if (/rate limit|too many requests/i.test(text) || status === 429) {
    return '上游大模型请求过于频繁，请稍后再试';
  }

  if (/timeout|aborted/i.test(text) || status === 504) {
    return '上游大模型响应超时，请稍后重新生成';
  }

  return text || '接口请求失败';
}

async function requestChatCompletion(messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(env.providerTimeoutMs, 45000));

  try {
    const response = await fetch('https://app.bwai.shop/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.bwaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env.bwaiModel,
        messages
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = normalizeUpstreamMessage(data.error?.message || data.message, response.status);
      throw new AppError(message, response.status, data);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError('上游大模型响应超时，请稍后重新生成', 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function createChatCompletion(messages) {
  if (!env.bwaiApiKey) {
    throw new AppError('未配置 BWAI_API_KEY', 500);
  }

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestChatCompletion(messages);
    } catch (error) {
      lastError = error;
      const statusCode = error.statusCode || 500;
      if (!RETRYABLE_STATUS_CODES.has(statusCode) || attempt === 2) break;
      await sleep(800 * (attempt + 1));
    }
  }

  throw lastError;
}

export async function askAssistant({ query, imageBase64 }) {
  const userContent = imageBase64
    ? [
        { type: 'text', text: query.trim() },
        { type: 'image_url', image_url: { url: imageBase64 } }
      ]
    : query.trim();

  const data = await createChatCompletion([
    {
      role: 'system',
      content: imageBase64
        ? '你是多模态图片问答助手。请认真观察用户上传的图片，并用中文直接回答用户的问题。'
        : '你是电商智能客服机器人，支持订单查询、退款、产品推荐、知识库问答，请用简洁清晰的中文回答。'
    },
    {
      role: 'user',
      content: userContent
    }
  ]);

  return {
    answer: data.choices?.[0]?.message?.content || '',
    model: env.bwaiModel,
    raw: data
  };
}
