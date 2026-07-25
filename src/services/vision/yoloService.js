import { env } from '../../config/env.js';
import { AppError } from '../../core/AppError.js';
import { askAssistant } from '../ai/chatCompletionService.js';

function normalizeYoloBaseUrl(url) {
  const normalized = String(url || '').trim().replace(/\/$/, '');

  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;

  return `https://${normalized}`;
}

async function requestYoloDetect(baseUrl, imageBase64) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${baseUrl}/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new AppError(data.detail || 'YOLO 识别服务调用失败', response.status, data);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function createVisionFallback(imageBase64, reason) {
  try {
    const result = await askAssistant({
      imageBase64,
      query: '请识别这张图片中的主要物体、人物、动物、场景和可见文字。请按“识别摘要、主要目标、位置关系、可信程度、使用建议”的结构输出中文识别报告。'
    });

    return {
      summary: 'YOLOv8 本地推理暂不可用，已自动切换为视觉大模型识别报告。',
      detections: [],
      image_size: null,
      model: `${result.model || env.bwaiModel} fallback`,
      fallbackAnswer: result.answer || '未获取到有效识别结果',
      fallbackReason: reason?.message || 'YOLO 服务暂不可用'
    };
  } catch (error) {
    return {
      summary: '识别服务暂时繁忙，请稍后重新上传图片识别。',
      detections: [],
      image_size: null,
      model: 'fallback-unavailable',
      fallbackAnswer: '抱歉，当前 YOLOv8 推理服务和备用视觉识别服务都暂时不可用。请稍后刷新页面后重新上传图片。',
      fallbackReason: error?.message || reason?.message || '识别服务暂不可用'
    };
  }
}

export async function detectWithYolo(imageBase64) {
  const baseUrl = normalizeYoloBaseUrl(env.yoloServiceUrl);

  if (!baseUrl) {
    return createVisionFallback(imageBase64, new Error('未配置 YOLO 服务地址'));
  }

  try {
    return await requestYoloDetect(baseUrl, imageBase64);
  } catch (error) {
    return createVisionFallback(imageBase64, error);
  }
}