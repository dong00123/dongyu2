import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';
import { postJson } from './providerHttp.js';

function normalizeOrganic(item) {
  return {
    title: item.title || '',
    url: item.link || '',
    snippet: item.snippet || '',
    position: item.position || null
  };
}

export async function searchWithSerper(query, num = 6) {
  if (!env.serperApiKey) {
    return {
      provider: 'serper',
      enabled: false,
      items: []
    };
  }

  const { ok, status, data } = await postJson(
    'https://google.serper.dev/search',
    {
      q: query,
      gl: 'cn',
      hl: 'zh-cn',
      num
    },
    {
      headers: {
        'X-API-KEY': env.serperApiKey
      }
    }
  );

  if (!ok) {
    throw new AppError(data?.message || 'Serper 查询失败', status, data);
  }

  return {
    provider: 'serper',
    enabled: true,
    answerBox: data.answerBox || null,
    knowledgeGraph: data.knowledgeGraph || null,
    items: Array.isArray(data.organic) ? data.organic.map(normalizeOrganic) : []
  };
}
