import { AppError } from '../core/AppError.js';
import { detectWithYolo } from '../services/vision/yoloService.js';

export async function detectVision(req, res) {
  const { imageBase64 } = req.body || {};

  if (!imageBase64?.trim()) {
    throw new AppError('图片内容不能为空', 400);
  }

  const result = await detectWithYolo(imageBase64);

  res.json({
    summary: result.summary,
    detections: result.detections || [],
    imageSize: result.image_size || null,
    model: result.model || 'yolov8n.pt'
  });
}