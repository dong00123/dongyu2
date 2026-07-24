import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';

function buildCallbackUrl(provider) {
  return `${env.appBaseUrl}/api/auth/callback/${provider}`;
}

function parseQueryString(text) {
  return Object.fromEntries(new URLSearchParams(text));
}

function parseJsonp(text) {
  const match = text.match(/\(([\s\S]+)\)/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

export function getOAuthProviders() {
  return {
    qq: {
      name: 'QQ 登录',
      enabled: Boolean(env.qqClientId && env.qqClientSecret)
    },
    wechat: {
      name: '微信登录',
      enabled: Boolean(env.wechatClientId && env.wechatClientSecret)
    }
  };
}

export function getProviderPublicConfig() {
  const providers = getOAuthProviders();
  return Object.entries(providers).map(([key, value]) => ({
    key,
    name: value.name,
    enabled: value.enabled,
    callbackUrl: buildCallbackUrl(key)
  }));
}

export function buildAuthorizeUrl(provider, state) {
  if (provider === 'qq') {
    if (!env.qqClientId) throw new AppError('未配置 QQ 登录 Client ID', 400);
    const url = new URL('https://graph.qq.com/oauth2.0/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.qqClientId);
    url.searchParams.set('redirect_uri', buildCallbackUrl('qq'));
    url.searchParams.set('state', state);
    return url.toString();
  }

  if (provider === 'wechat') {
    if (!env.wechatClientId) throw new AppError('未配置微信登录 AppID', 400);
    const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
    url.searchParams.set('appid', env.wechatClientId);
    url.searchParams.set('redirect_uri', buildCallbackUrl('wechat'));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'snsapi_login');
    url.searchParams.set('state', state);
    return `${url.toString()}#wechat_redirect`;
  }

  throw new AppError('不支持的登录提供方', 404);
}

async function exchangeQqCode(code) {
  const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  tokenUrl.searchParams.set('client_id', env.qqClientId);
  tokenUrl.searchParams.set('client_secret', env.qqClientSecret);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('redirect_uri', buildCallbackUrl('qq'));

  const tokenResp = await fetchText(tokenUrl.toString());
  if (!tokenResp.ok) {
    throw new AppError('QQ token 获取失败', tokenResp.status);
  }

  const tokenData = parseQueryString(tokenResp.text);
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new AppError('QQ token 返回无效');
  }

  const openIdResp = await fetchText(`https://graph.qq.com/oauth2.0/me?access_token=${accessToken}`);
  const openIdData = parseJsonp(openIdResp.text);
  const openId = openIdData?.openid;
  if (!openId) {
    throw new AppError('QQ openid 获取失败');
  }

  const userInfoUrl = new URL('https://graph.qq.com/user/get_user_info');
  userInfoUrl.searchParams.set('access_token', accessToken);
  userInfoUrl.searchParams.set('oauth_consumer_key', env.qqClientId);
  userInfoUrl.searchParams.set('openid', openId);

  const userResp = await fetchJson(userInfoUrl.toString());
  if (!userResp.ok || userResp.data?.ret !== 0) {
    throw new AppError(userResp.data?.msg || 'QQ 用户信息获取失败', userResp.status, userResp.data);
  }

  return {
    provider: 'qq',
    providerUserId: openId,
    nickname: userResp.data.nickname || 'QQ用户',
    avatar: userResp.data.figureurl_qq_2 || userResp.data.figureurl_2 || '',
    rawProfile: userResp.data
  };
}

async function exchangeWechatCode(code) {
  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.searchParams.set('appid', env.wechatClientId);
  tokenUrl.searchParams.set('secret', env.wechatClientSecret);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');

  const tokenResp = await fetchJson(tokenUrl.toString());
  if (!tokenResp.ok || tokenResp.data?.errcode) {
    throw new AppError(tokenResp.data?.errmsg || '微信 token 获取失败', tokenResp.status, tokenResp.data);
  }

  const accessToken = tokenResp.data.access_token;
  const openId = tokenResp.data.openid;
  if (!accessToken || !openId) {
    throw new AppError('微信 token 返回无效');
  }

  const userInfoUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  userInfoUrl.searchParams.set('access_token', accessToken);
  userInfoUrl.searchParams.set('openid', openId);
  userInfoUrl.searchParams.set('lang', 'zh_CN');

  const userResp = await fetchJson(userInfoUrl.toString());
  if (!userResp.ok || userResp.data?.errcode) {
    throw new AppError(userResp.data?.errmsg || '微信用户信息获取失败', userResp.status, userResp.data);
  }

  return {
    provider: 'wechat',
    providerUserId: openId,
    nickname: userResp.data.nickname || '微信用户',
    avatar: userResp.data.headimgurl || '',
    rawProfile: userResp.data
  };
}

export async function exchangeCodeForUser(provider, code) {
  if (provider === 'qq') return exchangeQqCode(code);
  if (provider === 'wechat') return exchangeWechatCode(code);
  throw new AppError('不支持的登录提供方', 404);
}
