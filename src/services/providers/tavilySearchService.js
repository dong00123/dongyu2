import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';
import { postJson } from './providerHttp.js';

function normalizeResult(item) {
  return {
    title: item.title || '',
    url: item.url || '',
    snippet: item.content || '',
    score: item.score || 0
  };
}

export async function searchWithTavily(query, maxResults = 5) {
  if (!env.tavilyApiKey) {
    return {
      provider: 'tavily',
      enabled: false,
      items: []
    };
  }

  const { ok, status, data } = await postJson('https://api.tavily.com/search', {
    api_key: env.tavilyApiKey,
    query,
    max_results: maxResults,
    topic: 'general',
    country: 'china',
    search_depth: 'basic',
    include_answer: 'basic',
    include_raw_content: false
  });

  if (!ok) {
    throw new AppError(data?.error || data?.message || 'Tavily 查询失败', status, data);
  }

  return {
    provider: 'tavily',
    enabled: true,
    answer: data.answer || '',
    items: Array.isArray(data.results) ? data.results.map(normalizeResult) : []
  };
}
