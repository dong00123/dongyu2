import { env } from '../../config/env.js';
import { askAssistant } from '../ai/chatCompletionService.js';

export async function detectWithYolo(imageBase64) {
  const result = await askAssistant({
    imageBase64,
    query: '请识别这张图片中的主要物体、人物、动物、场景和可见文字。请按“识别摘要、主要目标、位置关系、可信程度、使用建议”的结构输出中文识别报告。'
  });

  return {
    summary: '已完成图片识别，并生成视觉分析报告。',
    detections: [],
    image_size: null,
    model: result.model || env.bwaiModel,
    fallbackAnswer: result.answer || '未获取到有效识别结果',
    fallbackReason: ''
  };
}
