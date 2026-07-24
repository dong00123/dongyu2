import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';

export async function createChatCompletion(messages) {
  if (!env.bwaiApiKey) {
    throw new AppError('未配置 BWAI_API_KEY', 500);
  }

  const response = await fetch('https://app.bwai.shop/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.bwaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.bwaiModel,
      messages
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new AppError(data.error?.message || data.message || '接口请求失败', response.status, data);
  }

  return data;
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
