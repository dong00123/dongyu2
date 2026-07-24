import crypto from 'crypto';

const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${ITERATIONS}:${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [iterationsText, salt, original] = storedHash.split(':');
  const iterations = Number(iterationsText);
  if (!iterations || !salt || !original) return false;

  const derived = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(original, 'hex'));
}
