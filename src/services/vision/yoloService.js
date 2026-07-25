import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';

function normalizeYoloBaseUrl(url) {
  const normalized = String(url || '').trim().replace(/\/$/, '');

  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;

  return `https://${normalized}`;
}

export async function detectWithYolo(imageBase64) {
  const baseUrl = normalizeYoloBaseUrl(env.yoloServiceUrl);

  if (!baseUrl) {
    throw new AppError('未配置 YOLO 服务地址', 500);
  }

  const response = await fetch(`${baseUrl}/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ image_base64: imageBase64 })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AppError(data.detail || 'YOLO 识别服务调用失败', response.status, data);
  }

  return data;
}