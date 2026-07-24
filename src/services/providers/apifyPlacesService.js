import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';
import { postJson } from './providerHttp.js';

function pickImageUrl(item) {
  const imageCandidates = [
    item.imageUrl,
    item.image,
    item.thumbnail,
    item.mainImage,
    item.photoUrl,
    item.coverImage,
    item.photos?.[0]?.url,
    item.photos?.[0]?.imageUrl,
    item.images?.[0],
    item.imageUrls?.[0]
  ];

  return imageCandidates.find((url) => typeof url === 'string' && url.startsWith('http')) || '';
}

function normalizePlace(item) {
  return {
    name: item.title || item.name || '',
    address: item.address || item.street || '',
    category: item.categoryName || item.category || '',
    rating: item.totalScore || item.rating || null,
    reviewsCount: item.reviewsCount || item.reviews || null,
    website: item.website || '',
    phone: item.phone || '',
    price: item.price || item.priceLevel || '',
    imageUrl: pickImageUrl(item),
    location: item.location || null
  };
}

export async function searchPlacesWithApify(queries, maxPlacesPerQuery = 4) {
  if (!env.apifyApiKey) {
    return {
      provider: 'apify',
      enabled: false,
      items: []
    };
  }

  const { ok, status, data } = await postJson(
    `https://api.apify.com/v2/actors/${env.apifyPlacesActorId}/run-sync-get-dataset-items`,
    {
      searchStringsArray: queries,
      maxCrawledPlacesPerSearch: maxPlacesPerQuery,
      language: 'zh-CN'
    },
    {
      headers: {
        Authorization: `Bearer ${env.apifyApiKey}`
      },
      timeoutMs: Math.max(env.providerTimeoutMs, 30000)
    }
  );

  if (!ok) {
    throw new AppError(data?.message || 'Apify 地点查询失败', status, data);
  }

  return {
    provider: 'apify',
    enabled: true,
    items: Array.isArray(data) ? data.map(normalizePlace) : []
  };
}
