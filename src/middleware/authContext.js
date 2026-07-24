import { getSessionCookieName, getSessionUser } from '../services/auth/sessionService.js';
import { parseCookies } from '../utils/cookie.js';

export function attachAuthContext(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[getSessionCookieName()];
  req.auth = {
    token: token || null,
    user: getSessionUser(token || '')
  };
  next();
}
