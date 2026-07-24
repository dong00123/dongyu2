import { env } from '../../config/env.js';

export async function postJson(url, body, { headers = {}, timeoutMs = env.providerTimeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}
