import { createUserSession, deleteSession, getSessionUser as fetchSessionUser } from '../../repositories/sessionRepository.js';

const SESSION_COOKIE_NAME = 'dy_session';

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function createSession(user) {
  const session = createUserSession(user.id);
  return {
    token: session.token,
    user,
    maxAgeSeconds: session.maxAgeSeconds
  };
}

export function getSessionUser(token) {
  return fetchSessionUser(token);
}

export function destroySession(token) {
  deleteSession(token);
}
