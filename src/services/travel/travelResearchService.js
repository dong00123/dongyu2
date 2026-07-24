import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';
import { memoryCache } from '../../core/memoryCache.js';
import { searchPlacesWithApify } from '../providers/apifyPlacesService.js';
import { searchImagesWithSerper, searchWithSerper } from '../providers/serperSearchService.js';
import { searchWithTavily } from '../providers/tavilySearchService.js';

function cleanText(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/\?\?/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text || fallback;
}

function buildCacheKey(payload) {
  return [
    cleanText(payload.startCity),
    cleanText(payload.endCity),
    cleanText(payload.startDate),
    cleanText(payload.endDate),
    cleanText(payload.reqType),
    cleanText(payload.pref)
  ].join('|');
}

function dedupeWebItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const title = cleanText(item.title);
    const url = cleanText(item.url);
    const key = `${title}|${url}`;
    if (!title && !url) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizePlaces(items, fallbackText) {
  if (!items.length) return fallbackText;

  return items
    .slice(0, 8)
    .map((item, index) => {
      const segments = [
        `${index + 1}. ${cleanText(item.name, 'Unnamed place')}`,
        cleanText(item.category) ? `Category: ${cleanText(item.category)}` : '',
        cleanText(item.address) ? `Address: ${cleanText(item.address)}` : '',
        cleanText(item.rating) ? `Rating: ${cleanText(item.rating)}` : '',
        cleanText(item.price) ? `Price: ${cleanText(item.price)}` : '',
        cleanText(item.website) ? `Website: ${cleanText(item.website)}` : ''
      ].filter(Boolean);
      return segments.join(' | ');
    })
    .join('\n');
}

function summarizeWebItems(items, fallbackText) {
  if (!items.length) return fallbackText;

  return items
    .slice(0, 8)
    .map((item, index) => {
      const title = cleanText(item.title, 'Untitled reference');
      const snippet = cleanText(item.snippet, 'No snippet');
      const url = cleanText(item.url, 'No url');
      return `${index + 1}. ${title} | ${snippet} | ${url}`;
    })
    .join('\n');
}

function buildSourceStatus() {
  return [
    `BWAI configured: ${env.bwaiApiKey ? 'yes' : 'no'}`,
    `TianAPI configured: ${env.tianapiKey ? 'yes' : 'no'}`,
    `Tavily configured: ${env.tavilyApiKey ? 'yes' : 'no'}`,
    `Serper configured: ${env.serperApiKey ? 'yes' : 'no'}`,
    `Apify configured: ${env.apifyApiKey ? 'yes' : 'no'}`
  ].join('; ');
}

export async function researchTravelContext(payload) {
  const cacheKey = buildCacheKey(payload);
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const destination = cleanText(payload.endCity);
  const travelDays = `${cleanText(payload.startDate)} to ${cleanText(payload.endDate)}`;
  const broadTravelQuery = `${destination} travel guide attractions hotels food`;
  const localSearchQuery = `${destination} tourism attractions food hotels`;
  const scenicQuery = `${destination} tourist attractions`;
  const hotelQuery = `${destination} hotels`;
  const foodQuery = `${destination} restaurants food`;
  const imageQuery = `${destination} 旅游 景点 风景 实拍`;

  const tasks = [
    searchWithTavily(broadTravelQuery, 5),
    searchWithSerper(`${localSearchQuery} ${travelDays}`, 6),
    searchPlacesWithApify([scenicQuery, hotelQuery, foodQuery], 3),
    searchImagesWithSerper(imageQuery, 8)
  ];

  const results = await Promise.allSettled(tasks);

  const tavily = results[0].status === 'fulfilled' ? results[0].value : { provider: 'tavily', enabled: false, items: [] };
  const serper = results[1].status === 'fulfilled' ? results[1].value : { provider: 'serper', enabled: false, items: [] };
  const apify = results[2].status === 'fulfilled' ? results[2].value : { provider: 'apify', enabled: false, items: [] };
  const serperImages = results[3].status === 'fulfilled' ? results[3].value : { provider: 'serper-images', enabled: false, items: [] };

  results.forEach((result) => {
    if (result.status === 'rejected') {
      logger.warn('Travel provider request failed', { message: result.reason?.message || String(result.reason) });
    }
  });

  const webItems = dedupeWebItems([...(tavily.items || []), ...(serper.items || [])]);
  const placeItems = apify.items || [];
  const imageItems = serperImages.items || [];

  const context = {
    sourceStatus: buildSourceStatus(),
    tavilyAnswer: cleanText(tavily.answer, 'No automatic summary available.'),
    webReferenceText: summarizeWebItems(
      webItems,
      `No useful web references were found. Please rely on generally safe travel patterns for ${destination}.`
    ),
    placesReferenceText: summarizePlaces(
      placeItems,
      `No useful place-level references were found. Please infer lodging, attractions and food suggestions for ${destination}.`
    ),
    placeItems,
    imageItems,
    providerMeta: {
      tavilyResults: tavily.items?.length || 0,
      serperResults: serper.items?.length || 0,
      apifyPlaces: apify.items?.length || 0,
      serperImages: serperImages.items?.length || 0
    }
  };

  memoryCache.set(cacheKey, context, env.travelResearchCacheTtlMs);
  return context;
}
