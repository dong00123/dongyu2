import { AppError } from '../core/AppError.js';
import { detectWithYolo } from '../services/vision/yoloService.js';

export async function detectVision(req, res) {
  const { imageBase64 } = req.body || {};

  if (!imageBase64?.trim()) {
    throw new AppError('图片内容不能为空', 400);
  }

  try {
    const result = await detectWithYolo(imageBase64);

    return res.json({
      summary: result.summary,
      detections: result.detections || [],
      imageSize: result.image_size || null,
      model: result.model || 'yolov8n.pt',
      fallbackAnswer: result.fallbackAnswer || '',
      fallbackReason: result.fallbackReason || ''
    });
  } catch (error) {
    return res.json({
      summary: '识别服务暂时繁忙，请稍后重新上传图片识别。',
      detections: [],
      imageSize: null,
      model: 'unavailable',
      fallbackAnswer: '抱歉，当前识别服务暂时不可用。请稍后刷新页面后重新上传图片。',
      fallbackReason: error?.message || '识别服务异常'
    });
  }
}
