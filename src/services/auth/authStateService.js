import crypto from 'crypto';
import { memoryCache } from '../../core/memoryCache.js';

const STATE_TTL_MS = 10 * 60 * 1000;

export function issueAuthState(provider) {
  const state = crypto.randomBytes(16).toString('hex');
  memoryCache.set(`oauth_state:${state}`, { provider }, STATE_TTL_MS);
  return state;
}

export function consumeAuthState(state, provider) {
  const record = memoryCache.get(`oauth_state:${state}`);
  if (!record) return false;
  if (record.provider !== provider) return false;
  memoryCache.set(`oauth_state:${state}`, null, 1);
  return true;
}
