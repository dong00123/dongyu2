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
    return `${fallbackLabel}: 暂未获取到实时票务数据。Do not repeat this sentence as multiple cards. Mention it only once in the transport section, then provide estimated transport choices based on common routes.`;
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
5. If live tickets are unavailable, mention "暂未获取到实时票务数据" only once in the transport section, then give realistic estimated transport suggestions for ${startCity} to ${endCity}.
6. Do not say the cities or dates are unclear. They are clear.
7. Do not create repeated cards, rows, or blocks containing the same unavailable-ticket sentence.

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

function normalizeTicketPlaceholder(text) {
  let seenTicketPlaceholder = false;

  return String(text || '').replace(
    /<div class="(?:item-line|date-item|day-plan|result-text)">\s*暂未获取到实时票务数据\s*<\/div>/g,
    (match) => {
      if (seenTicketPlaceholder) return '';
      seenTicketPlaceholder = true;
      return match;
    }
  );
}

function extractHtmlContent(modelText) {
  const text = String(modelText || '').trim();
  const sectionIndex = text.indexOf('<section');

  if (sectionIndex >= 0) {
    return normalizeTicketPlaceholder(
      text
        .slice(sectionIndex)
      .replace(/\?\?/g, '')
      .replace(/\uFFFD/g, '')
      .replace(/no live ticket feed returned yet/gi, '暂未获取到实时票务数据')
      .replace(/no live ticket feed returned/gi, '暂未获取到实时票务数据')
      .trim()
    );
  }

  const cleaned = normalizeTicketPlaceholder(
    text
      .replace(/\?\?/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/no live ticket feed returned yet/gi, '暂未获取到实时票务数据')
    .replace(/no live ticket feed returned/gi, '暂未获取到实时票务数据')
    .trim()
  );
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

function buildFallbackPlanHtml(payload, reason) {
  const startCity = cleanText(payload.startCity);
  const endCity = cleanText(payload.endCity);
  const startDate = cleanText(payload.startDate);
  const endDate = cleanText(payload.endDate);
  const personNum = cleanText(payload.personNum, '未填写');
  const budget = cleanText(payload.budget, '未填写');
  const pref = cleanText(payload.pref, '未填写');
  const warning = cleanText(reason, '上游服务繁忙，已先生成基础版方案');

  return `
<section class="result-block">
  <h4>方案总览</h4>
  <div class="result-text">这是一份为 ${startCity} 出发、前往 ${endCity} 的基础版旅行提案。系统已保留你的城市、日期、预算和偏好，并先按顾问式交付结构生成可执行版本；稍后重新生成时，可继续升级为更细的实时增强版。</div>
  <div class="item-line">行程信息：${startDate} 至 ${endDate}，${personNum} 人出行，整体预算 ${budget} 元。</div>
  <div class="item-line">偏好重点：${pref}。</div>
  <div class="date-item">生成状态：${warning}，当前内容已按基础旅行逻辑完成排版。</div>
</section>
<section class="result-block">
  <h4>核心判断</h4>
  <div class="item-line">本次行程适合采用“白天核心景点 + 下午轻体验 + 晚间美食夜游”的节奏，避免把每天排得过满。</div>
  <div class="item-line">住宿建议优先选择靠近地铁、商圈或核心景点连线的位置，减少换乘和夜间返程压力。</div>
  <div class="item-line">如果希望拍照出片，建议把城市地标、文化街区和夜景区域安排在光线更好的下午到傍晚。</div>
</section>
<section class="result-block">
  <h4>交通方案与候选对比</h4>
  <div class="item-line">高铁方案：优先关注总耗时、到达站离酒店的距离，以及抵达后是否方便直接入住。</div>
  <div class="item-line">航班方案：适合距离较远或时间敏感的行程，但要把机场往返、安检和延误风险计入总耗时。</div>
  <div class="item-line">自驾或包车：适合多人同行和周边点位较分散的路线，但要预留停车、限行和疲劳驾驶风险。</div>
</section>
<section class="result-block">
  <h4>住宿区域与酒店选择建议</h4>
  <div class="item-line">优先区域：地铁换乘站、核心商圈、老城文化区边缘，兼顾交通、餐饮和夜间安全感。</div>
  <div class="item-line">酒店选择：优先看近期真实评价、隔音、卫生、步行到地铁距离和夜间返程便利度。</div>
  <div class="item-line">不建议区域：交通接驳弱、夜间餐饮少、离核心路线太远但价格优势不明显的位置。</div>
</section>
<section class="result-block">
  <h4>预算拆分</h4>
  <div class="item-line">交通：建议预留整体预算的 25% - 35%，根据高铁或航班价格浮动。</div>
  <div class="item-line">住宿：建议预留整体预算的 30% - 40%，优先换取位置便利和休息质量。</div>
  <div class="item-line">餐饮与体验：建议预留整体预算的 20% - 25%，把本地特色餐和夜游体验留出空间。</div>
  <div class="item-line">机动金：建议保留 10% 左右，用于打车、临时改签、门票补差和伴手礼。</div>
</section>
<section class="result-block">
  <h4>每日详细安排</h4>
  <div class="day-plan">第一天：抵达 ${endCity} 后办理入住，下午安排酒店周边轻松熟悉路线，晚上选择本地餐厅和夜景散步，不排高强度景点。</div>
  <div class="day-plan">第二天：上午安排城市核心景点，下午安排文化街区、博物馆或城市公园，傍晚到夜间安排拍照和美食。</div>
  <div class="day-plan">第三天：根据体力安排周边风景、特色街区或深度体验项目，晚上回到住宿附近轻松收尾。</div>
  <div class="day-plan">返程日：保留半天机动时间，优先安排近距离打卡、伴手礼采购和从容返程。</div>
</section>
<section class="result-block">
  <h4>美食、夜游与拍照建议</h4>
  <div class="item-line">美食：优先选择本地人常去、评价稳定、离住宿或景点不远的餐厅，不建议为了网红店长距离绕行。</div>
  <div class="item-line">夜游：选择灯光好、返程方便、人流稳定的区域，尽量避免太偏或交通不便的点位。</div>
  <div class="item-line">拍照：把地标外景放在下午或傍晚，把室内空间、咖啡馆和酒店公共区作为雨天备选。</div>
</section>
<section class="result-block">
  <h4>风险提醒与出发前清单</h4>
  <div class="item-line">提前确认酒店入住时间、退改政策、身份证件、充电设备、常用药和雨具。</div>
  <div class="item-line">重要票务和热门餐厅建议提前预约；实时交通价格以购票平台为准。</div>
  <div class="item-line">保留 Plan B：遇到天气、拥堵或体力不足时，把户外点位替换成博物馆、商圈或咖啡馆。</div>
</section>`.trim();
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

  let html = '';
  let generationWarning = null;

  try {
    const data = await createChatCompletion([
      {
        role: 'user',
        content: prompt
      }
    ]);
    html = extractHtmlContent(data.choices?.[0]?.message?.content);
  } catch (error) {
    generationWarning = error.message || '上游大模型服务临时不可用';
    html = buildFallbackPlanHtml(normalizedPayload, generationWarning);
  }

  return {
    html,
    placeHighlights,
    meta: {
      model: env.bwaiModel,
      mode: reqType,
      flightCount: flightList.length,
      trainCount: trainList.length,
      generationWarning,
      research: travelContext.providerMeta
    }
  };
}
