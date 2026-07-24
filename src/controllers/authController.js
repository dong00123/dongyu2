import { env } from '../config/env.js';
import { AppError } from '../core/AppError.js';
import { buildCookie } from '../utils/cookie.js';
import { getProviderPublicConfig, buildAuthorizeUrl, exchangeCodeForUser } from '../services/auth/oauthProviders.js';
import { consumeAuthState, issueAuthState } from '../services/auth/authStateService.js';
import { createSession, destroySession, getSessionCookieName } from '../services/auth/sessionService.js';
import { loginLocalUser, loginOauthUser, registerLocalUser } from '../services/auth/userAuthService.js';

function authCenterUrl(status, provider, message = '') {
  const url = new URL('/auth-center.html', env.appBaseUrl);
  url.searchParams.set('status', status);
  if (provider) url.searchParams.set('provider', provider);
  if (message) url.searchParams.set('message', message);
  return url.toString();
}

function attachSessionCookie(res, session) {
  res.setHeader(
    'Set-Cookie',
    buildCookie(getSessionCookieName(), session.token, {
      maxAge: session.maxAgeSeconds,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: env.nodeEnv === 'production'
    })
  );
}

export function getAuthProviders(req, res) {
  res.json({
    providers: getProviderPublicConfig()
  });
}

export function getCurrentSession(req, res) {
  res.json({
    authenticated: Boolean(req.auth?.user),
    user: req.auth?.user || null
  });
}

export function register(req, res) {
  const user = registerLocalUser(req.body || {});
  const session = createSession(user);
  attachSessionCookie(res, session);
  res.status(201).json({
    ok: true,
    user
  });
}

export function login(req, res) {
  const user = loginLocalUser(req.body || {});
  const session = createSession(user);
  attachSessionCookie(res, session);
  res.json({
    ok: true,
    user
  });
}

export function getLoginUrl(req, res) {
  const provider = req.params.provider;
  const state = issueAuthState(provider);
  const url = buildAuthorizeUrl(provider, state);
  res.json({ provider, url, state });
}

export function redirectToProvider(req, res) {
  const provider = req.params.provider;
  const state = issueAuthState(provider);
  const url = buildAuthorizeUrl(provider, state);
  res.redirect(url);
}

export async function handleOAuthCallback(req, res) {
  const provider = req.params.provider;
  const { code, state } = req.query;

  if (!code || !state) {
    throw new AppError('缺少 OAuth 回调参数', 400);
  }

  if (!consumeAuthState(String(state), provider)) {
    throw new AppError('登录状态校验失败，请重新发起登录', 400);
  }

  const profile = await exchangeCodeForUser(provider, String(code));
  const user = loginOauthUser(profile);
  const session = createSession(user);
  attachSessionCookie(res, session);
  res.redirect(authCenterUrl('success', provider));
}

export function logout(req, res) {
  if (req.auth?.token) {
    destroySession(req.auth.token);
  }

  res.setHeader(
    'Set-Cookie',
    buildCookie(getSessionCookieName(), '', {
      maxAge: 0,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: env.nodeEnv === 'production'
    })
  );

  res.json({ ok: true });
}
