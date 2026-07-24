import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';
import { createChatCompletion } from '../ai/chatCompletionService.js';
import { getFlightsByTianApi, getTrainTicketsByTianApi } from './tianApiService.js';
import { researchTravelContext } from './travelResearchService.js';

function cleanText(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/\?\?/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text || fallback;
}

function formatTransportDataset(items, fallbackLabel) {
  if (!items?.length) {
    return `${fallbackLabel}: no live ticket feed returned. Provide realistic suggestion candidates instead of saying information is missing.`;
  }

  return JSON.stringify(items);
}

function buildTravelModeGuide(reqType) {
  const mapping = {
    full: 'Provide a complete trip plan covering transport, lodging, daily pacing, budget split, food and risks.',
    flight: 'Focus on flight options, airport transfers, time cost and suitability.',
    train: 'Focus on train options, stations, transfers, time cost and suitability.',
    hotel: 'Focus on lodging districts, transport convenience, vibe, budget and suitability.'
  };

  return mapping[reqType] || mapping.full;
}

function buildTravelPrompt(payload, datasets, context) {
  const startCity = cleanText(payload.startCity);
  const endCity = cleanText(payload.endCity);
  const startDate = cleanText(payload.startDate);
  const endDate = cleanText(payload.endDate);
  const personNum = cleanText(payload.personNum, 'not provided');
  const budget = cleanText(payload.budget, 'not provided');
  const reqType = cleanText(payload.reqType, 'full');
  const pref = cleanText(payload.pref, 'not provided');
  const { flightList, trainList } = datasets;

  return `
You are a premium private travel consultant.
Return pure HTML only, and write the content in Simplified Chinese.

Hard rules:
1. Do not output Markdown, code fences, lead-in phrases, explanations, or meta commentary.
2. The response must start with <section class="result-block">.
3. Never output "??", "information missing", "not sure", or placeholders.
4. You already know the exact trip facts and must use them explicitly:
   - Departure city: ${startCity}
   - Destination city: ${endCity}
   - Travel dates: ${startDate} to ${endDate}
   - Travelers: ${personNum}
   - Total budget: ${budget}
   - Preference: ${pref}
5. If live tickets are unavailable, say only "暂未获取到实时票务数据", but still give realistic transport suggestions for ${startCity} to ${endCity}.
6. Do not say the cities or dates are unclear. They are clear.

HTML structure rules:
- Only use these classes: result-block, item-line, date-item, day-plan, result-text
- Every section must be wrapped in <section class="result-block">
- Section titles use <h4>
- Body paragraphs use <div class="result-text">
- Suggestion items use <div class="item-line">
- Daily schedules use <div class="day-plan">
- Dates or timeline rows use <div class="date-item">

Quality rules:
- The answer should feel like a polished, professional travel delivery document.
- Be specific, detailed, executable, and city-aware.
- Each day must include morning, afternoon, and evening.
- Include budget split, lodging district advice, local food advice, photo/night suggestions, risk reminders, Plan B, and pre-departure checklist.
- Use the retrieval context below when useful, but do not copy raw source noise.

Mode: ${reqType}
Mode guide: ${buildTravelModeGuide(reqType)}

Source status:
${context.sourceStatus}

Retrieved web references:
${context.webReferenceText}

Retrieved place references:
${context.placesReferenceText}

Retrieved summary:
${cleanText(context.tavilyAnswer, 'No automatic summary available.')}

Flight data:
${formatTransportDataset(flightList, 'Flights')}

Train data:
${formatTransportDataset(trainList, 'Trains')}

Output exactly these 12 sections in this order:
1. 方案总览
2. 适合这次出行的核心判断
3. 交通方案与候选对比
4. 住宿区域与酒店选择建议
5. 预算拆分
6. 行程节奏建议
7. 每日详细安排
8. 当地美食与夜生活建议
9. 拍照打卡与体验升级建议
10. 风险提醒与避坑清单
11. Plan B 备选方案
12. 出发前准备清单`;
}

function extractHtmlContent(modelText) {
  const text = String(modelText || '').trim();
  const sectionIndex = text.indexOf('<section');

  if (sectionIndex >= 0) {
    return text
      .slice(sectionIndex)
      .replace(/\?\?/g, '')
      .replace(/\uFFFD/g, '')
      .replace(/no live ticket feed returned yet/gi, '暂未获取到实时票务数据')
      .trim();
  }

  const cleaned = text
    .replace(/\?\?/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/no live ticket feed returned yet/gi, '暂未获取到实时票务数据')
    .trim();
  return `
<section class="result-block">
  <h4>方案输出</h4>
  <div class="result-text">${cleaned || '行程生成失败，请稍后重试。'}</div>
</section>`.trim();
}

function pickRealImageUrl(imageItems, index) {
  return cleanText(imageItems[index]?.imageUrl || imageItems[index]?.thumbnailUrl || imageItems[index]?.url);
}

function buildDefaultPlaceHighlights(destination, imageItems) {
  const defaultPlaces = [
    { name: `${destination}城市地标`, category: '城市地标', address: `${destination}核心观光区域` },
    { name: `${destination}夜景街区`, category: '夜游体验', address: `${destination}适合晚间散步的区域` },
    { name: `${destination}历史文化区`, category: '人文体验', address: `${destination}老城或文化片区` },
    { name: `${destination}本地美食街`, category: '美食体验', address: `${destination}本地餐饮聚集区` },
    { name: `${destination}自然风光`, category: '自然风景', address: `${destination}城市周边或公园区域` },
    { name: `${destination}拍照打卡点`, category: '拍照出片', address: `${destination}热门拍照区域` }
  ];

  return defaultPlaces
    .map((place, index) => ({
      ...place,
      rating: '',
      imageUrl: pickRealImageUrl(imageItems, index)
    }))
    .filter((place) => place.imageUrl);
}

function buildPlaceHighlights(context, destination) {
  const seen = new Set();
  const imageItems = context.imageItems || [];
  const places = (context.placeItems || [])
    .filter((place) => cleanText(place.name))
    .filter((place) => {
      const key = cleanText(place.name).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map((place, index) => ({
      name: cleanText(place.name),
      category: cleanText(place.category, '推荐景点'),
      address: cleanText(place.address, `${destination}热门区域`),
      rating: cleanText(place.rating),
      imageUrl: cleanText(place.imageUrl) || pickRealImageUrl(imageItems, index)
    }))
    .filter((place) => place.imageUrl);

  return places.length ? places : buildDefaultPlaceHighlights(destination, imageItems);
}

export async function generateTravelPlan(payload) {
  const startCity = cleanText(payload.startCity);
  const endCity = cleanText(payload.endCity);
  const startDate = cleanText(payload.startDate);
  const endDate = cleanText(payload.endDate);
  const reqType = cleanText(payload.reqType, 'full');

  if (!startCity || !endCity || !startDate || !endDate) {
    throw new AppError('出发地、目的地和行程日期不能为空', 400);
  }

  let flightList = [];
  let trainList = [];

  if (reqType === 'full' || reqType === 'flight') {
    flightList = await getFlightsByTianApi(startCity, endCity, startDate);
  }

  if (reqType === 'full' || reqType === 'train') {
    trainList = await getTrainTicketsByTianApi(startCity, endCity, startDate);
  }

  const normalizedPayload = {
    ...payload,
    startCity,
    endCity,
    startDate,
    endDate,
    reqType,
    personNum: cleanText(payload.personNum),
    budget: cleanText(payload.budget),
    pref: cleanText(payload.pref)
  };

  const travelContext = await researchTravelContext(normalizedPayload);
  const placeHighlights = buildPlaceHighlights(travelContext, endCity);
  const prompt = buildTravelPrompt(normalizedPayload, { flightList, trainList }, travelContext);

  const data = await createChatCompletion([
    {
      role: 'user',
      content: prompt
    }
  ]);

  return {
    html: extractHtmlContent(data.choices?.[0]?.message?.content),
    placeHighlights,
    meta: {
      model: env.bwaiModel,
      mode: reqType,
      flightCount: flightList.length,
      trainCount: trainList.length,
      research: travelContext.providerMeta
    }
  };
}
