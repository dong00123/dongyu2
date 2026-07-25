import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const envFilePath = path.join(projectRoot, '.env.local');

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv(envFilePath);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8000),
  projectRoot,
  publicPath: path.join(projectRoot, 'public'),
  envFilePath,
  appName: process.env.APP_NAME || 'Dongyu Travel Agent',
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 8000}`,
  bwaiApiKey: process.env.BWAI_API_KEY || '',
  bwaiModel: process.env.BWAI_MODEL || 'gpt-5.4-mini',
  yoloServiceUrl: process.env.YOLO_SERVICE_URL || 'https://dongyu-yolo.onrender.com',
  tianapiKey: process.env.TIANAPI_KEY || '',
  tavilyApiKey: process.env.TAVILY_API_KEY || process.env.tavily || '',
  serperApiKey: process.env.SERPER_API_KEY || process.env.serper || '',
  apifyApiKey: process.env.APIFY_API_KEY || process.env.Apify || '',
  qqClientId: process.env.QQ_CLIENT_ID || '',
  qqClientSecret: process.env.QQ_CLIENT_SECRET || '',
  wechatClientId: process.env.WECHAT_CLIENT_ID || '',
  wechatClientSecret: process.env.WECHAT_CLIENT_SECRET || '',
  apifyPlacesActorId: process.env.APIFY_PLACES_ACTOR_ID || 'compass~crawler-google-places',
  travelResearchCacheTtlMs: Number(process.env.TRAVEL_RESEARCH_CACHE_TTL_MS || 15 * 60 * 1000),
  providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS || 15000)
};

export function getEnvSummary() {
  return {
    nodeEnv: env.nodeEnv,
    port: env.port,
    appBaseUrl: env.appBaseUrl,
    model: env.bwaiModel,
    hasBwaiKey: Boolean(env.bwaiApiKey),
    hasYoloServiceUrl: Boolean(env.yoloServiceUrl),
    hasTianapiKey: Boolean(env.tianapiKey),
    hasTavilyKey: Boolean(env.tavilyApiKey),
    hasSerperKey: Boolean(env.serperApiKey),
    hasApifyKey: Boolean(env.apifyApiKey),
    hasQqAuth: Boolean(env.qqClientId && env.qqClientSecret),
    hasWechatAuth: Boolean(env.wechatClientId && env.wechatClientSecret),
    apifyPlacesActorId: env.apifyPlacesActorId,
    travelResearchCacheTtlMs: env.travelResearchCacheTtlMs
  };
}