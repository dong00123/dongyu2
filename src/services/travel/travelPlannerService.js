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

function formatBudgetRange(totalBudget, minRatio, maxRatio, fallback) {
  const numericBudget = Number(String(totalBudget || '').replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numericBudget) || numericBudget <= 0) {
    return fallback;
  }

  const minAmount = Math.round((numericBudget * minRatio) / 10) * 10;
  const maxAmount = Math.round((numericBudget * maxRatio) / 10) * 10;
  return `约 ${minAmount} - ${maxAmount} 元`;
}

function buildFallbackPlanHtml(payload, reason) {
  const startCity = cleanText(payload.startCity);
  const endCity = cleanText(payload.endCity);
  const startDate = cleanText(payload.startDate);
  const endDate = cleanText(payload.endDate);
  const personNum = cleanText(payload.personNum, '未填写');
  const budget = cleanText(payload.budget, '未填写');
  const pref = cleanText(payload.pref, '未填写');
  const warning = cleanText(reason, '实时增强服务暂时不可用，已先生成基础版方案');
  const transportBudget = formatBudgetRange(budget, 0.25, 0.35, '建议预留整体预算的 25% - 35%');
  const lodgingBudget = formatBudgetRange(budget, 0.3, 0.4, '建议预留整体预算的 30% - 40%');
  const foodBudget = formatBudgetRange(budget, 0.2, 0.25, '建议预留整体预算的 20% - 25%');
  const flexibleBudget = formatBudgetRange(budget, 0.08, 0.12, '建议保留整体预算的 8% - 12%');

  return `
<section class="result-block">
  <h4>方案总览</h4>
  <div class="result-text">这是一份从 ${startCity} 出发、前往 ${endCity} 的可执行旅行初版。系统已保留城市、日期、人数、预算和偏好，并先按真实出行逻辑补齐交通、住宿、预算、每日节奏、餐饮夜游和风险备选；后续重新生成时，可继续叠加实时票务、酒店和景点数据。</div>
  <div class="item-line">行程信息：${startDate} 至 ${endDate}，${personNum} 人出行，整体预算 ${budget} 元；预算默认覆盖往返大交通、住宿、市内交通、餐饮、门票体验和少量机动金，不含大额购物。</div>
  <div class="item-line">偏好重点：${pref}。规划时优先保证路线不折腾、住宿离交通节点近、每天有明确主线，并给休息和临时调整留出空间。</div>
  <div class="date-item">生成状态：当前为基础规划版本，${warning}。页面内容已避免展示技术化报错，可直接作为行程初稿继续细化。</div>
</section>
<section class="result-block">
  <h4>核心判断</h4>
  <div class="item-line">本次行程建议采用“上午核心景点、下午轻体验、傍晚拍照、晚上美食夜游”的节奏，比全天赶景点更稳，也更适合第一次到 ${endCity} 的旅行。</div>
  <div class="item-line">住宿应优先放在地铁站、火车站衔接区、成熟商圈或核心景点连线附近，避免为了便宜选择远郊位置，导致每天多花 1 - 2 小时在路上。</div>
  <div class="item-line">如果天气炎热、下雨或体力下降，优先把户外景点替换成博物馆、商场、咖啡馆、城市展馆等室内点位，不要强行按原路线硬走。</div>
  <div class="item-line">拍照和夜景建议安排在下午到傍晚，光线更柔和；正午更适合午餐、休息、室内展馆或短距离转场。</div>
</section>
<section class="result-block">
  <h4>交通方案与候选对比</h4>
  <div class="item-line">高铁方案：优先作为 ${startCity} 到 ${endCity} 的主方案，重点看总耗时、到达站和酒店距离。若抵达站靠近地铁或商圈，落地后办理入住会更顺。</div>
  <div class="item-line">航班方案：适合距离较远或车次不理想时备用，但需要把往返机场、安检、行李等待和延误风险全部计入，总耗时不一定比高铁更短。</div>
  <div class="item-line">自驾或包车：仅在计划去周边分散景点、多人同行或携带较多行李时优先考虑；两人短途城市游通常不如公共交通和打车组合划算。</div>
  <div class="item-line">市内交通：白天优先地铁和步行，晚间或跨区转场用打车补足；酒店选择时要重点看“步行到地铁站时间”，不要只看直线距离。</div>
</section>
<section class="result-block">
  <h4>住宿区域与酒店选择建议</h4>
  <div class="item-line">首选区域：靠近高铁站、主火车站、地铁换乘站、核心商圈或老城文化区边缘的位置，兼顾抵离便利、吃饭选择和夜间返程安全感。</div>
  <div class="item-line">酒店筛选：优先看近 3 - 6 个月真实评价、隔音、卫生、空调、热水、床品、步行到地铁距离，以及夜间周边是否有餐饮和便利店。</div>
  <div class="item-line">预算策略：如果总预算有限，宁可少住一点面积，也要换取更好的位置；位置太偏会把省下的房费花在打车和时间成本上。</div>
  <div class="item-line">不建议区域：交通接驳弱、夜间餐饮少、距离核心商圈和地铁线路过远，或价格优势不明显的位置。</div>
</section>
<section class="result-block">
  <h4>预算拆分</h4>
  <div class="item-line">交通预算：${transportBudget}，优先锁定往返大交通，再根据余量决定是否增加打车、机场快线或舒适座席。</div>
  <div class="item-line">住宿预算：${lodgingBudget}，建议优先换取位置便利和睡眠质量，不要只按最低价排序。</div>
  <div class="item-line">餐饮与体验：${foodBudget}，留给本地特色餐、咖啡甜品、夜游和少量门票体验，避免每天都吃临时凑合的餐厅。</div>
  <div class="item-line">机动金：${flexibleBudget}，用于临时打车、改签补差、雨具、防晒、伴手礼或临时增加的体验项目。</div>
</section>
<section class="result-block">
  <h4>行程节奏建议</h4>
  <div class="date-item">每天只设置 1 个必须完成的核心目标，其余安排作为加分项；这样遇到排队、天气或体力变化时不会全盘打乱。</div>
  <div class="date-item">上午安排博物馆、地标或需要预约的项目；下午安排街区、公园、咖啡馆或轻松体验；晚上围绕住宿附近或交通便利区域吃饭夜游。</div>
  <div class="date-item">连续步行时间尽量控制在 60 - 90 分钟内，中间插入午餐、咖啡或回酒店休息，适合 ${personNum} 人同行时保持节奏一致。</div>
</section>
<section class="result-block">
  <h4>每日详细安排</h4>
  <div class="day-plan">第一天：上午或中午从 ${startCity} 出发，抵达 ${endCity} 后先办理入住、放行李和短暂休息；下午只安排酒店周边、核心商圈或城市地标熟悉路线；晚上选择离酒店不远的本地餐厅，再安排 30 - 60 分钟夜景散步，不排高强度景点。</div>
  <div class="day-plan">第二天：上午安排 ${endCity} 最值得优先体验的核心景点或博物馆，提前预约并预留 2 - 3 小时；中午在景点附近吃本地特色餐；下午转向文化街区、城市公园或室内展馆；傍晚到夜间安排拍照、夜景和美食，返程尽量选择地铁直达或短距离打车。</div>
  <div class="day-plan">第三天：上午根据体力选择周边风景、特色街区、轻度体验项目或伴手礼采购；下午减少跨区移动，把活动控制在住宿或返程交通节点附近；晚上回到酒店周边轻松收尾，整理行李并确认返程路线。</div>
  <div class="day-plan">返程日：保留至少半天机动时间，优先安排近距离早餐、咖啡、城市地标补拍或伴手礼采购；建议提前 60 - 90 分钟到车站，若是机场返程则提前 2 - 3 小时出发。</div>
</section>
<section class="result-block">
  <h4>当地美食与夜生活建议</h4>
  <div class="item-line">美食选择：优先选择本地人常去、评价稳定、离住宿或景点不远的餐厅；不要为了单个网红店长距离绕行，容易牺牲整天节奏。</div>
  <div class="item-line">点餐策略：两人同行建议每餐控制在 2 - 3 个菜或 1 个主食加 1 - 2 个小吃，既能尝到特色，也不容易浪费预算和体力。</div>
  <div class="item-line">夜游区域：优先选择灯光好、人流稳定、打车方便、离地铁不远的商圈、滨水步道或城市夜景区；避免太偏、太晚或返程不确定的点位。</div>
  <div class="item-line">时间安排：夜游不要排到太晚，第二天有核心景点或早车时，建议把回酒店时间控制在 22:00 前后。</div>
</section>
<section class="result-block">
  <h4>拍照打卡与体验升级建议</h4>
  <div class="item-line">城市地标：放在下午到傍晚，光线更柔和，适合拍外景、人像和城市天际线。</div>
  <div class="item-line">文化街区：适合安排在午后，边走边拍，同时穿插咖啡、甜品或小吃，节奏比纯打卡更舒服。</div>
  <div class="item-line">夜景照片：选择交通便利、人流稳定的区域，拍完后能快速回酒店，不把夜间返程变成额外风险。</div>
  <div class="item-line">雨天备选：把室内展馆、商场、书店、咖啡馆和酒店公共空间作为补充，避免照片计划完全受天气影响。</div>
</section>
<section class="result-block">
  <h4>风险提醒与避坑清单</h4>
  <div class="item-line">票务风险：热门场馆、演出和部分景点建议提前预约；实时交通价格和余票以正式购票平台为准。</div>
  <div class="item-line">天气风险：出发前查看 ${endCity} 逐日天气，准备雨具、防晒、舒适鞋和薄外套；高温时减少正午户外暴走。</div>
  <div class="item-line">住宿风险：下单前确认入住时间、取消政策、押金规则、发票需求、是否有电梯，以及夜间返程是否方便。</div>
  <div class="item-line">节奏风险：不要把远距离周边景点和市区核心点强行塞进同一天；一旦交通超过预期，优先删掉非核心项目。</div>
</section>
<section class="result-block">
  <h4>Plan B 备选方案</h4>
  <div class="item-line">天气不好：把户外点位替换成博物馆、商场、书店、咖啡馆、城市展馆或室内体验项目。</div>
  <div class="item-line">体力不足：取消跨区景点，改为酒店附近餐饮、短途散步和轻松拍照，保证第二天状态。</div>
  <div class="item-line">交通延误：优先保留入住、正餐和返程节点，压缩拍照打卡和购物时间，不影响关键安排。</div>
  <div class="item-line">预算紧张：减少打车和网红餐厅，保留核心景点、位置合适的住宿和必要交通，把体验集中在最想去的 1 - 2 个项目上。</div>
</section>
<section class="result-block">
  <h4>出发前准备清单</h4>
  <div class="item-line">证件与票务：身份证件、车票或机票、酒店订单、预约二维码、紧急联系人和电子备份。</div>
  <div class="item-line">随身物品：充电器、充电宝、雨伞、防晒、纸巾、常用药、舒适鞋和轻便背包。</div>
  <div class="item-line">行程确认：出发前一天再次确认天气、交通时间、酒店位置、入住政策和第一天晚餐备选。</div>
  <div class="item-line">沟通约定：${personNum} 人同行时，提前确认每天最想完成的核心目标，避免现场因为取舍产生分歧。</div>
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
