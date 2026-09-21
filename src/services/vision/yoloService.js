import { env } from '../../config/env.js';
import { askAssistant } from '../ai/chatCompletionService.js';

const DATA_URI_PATTERN = /^data:([^;,]+);base64,(.+)$/s;

function parseImageSizeFromBase64(dataUri) {
  const match = String(dataUri || '').match(DATA_URI_PATTERN);
  if (!match) return null;

  let bytes;
  try {
    bytes = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }

  if (bytes.length < 24) return null;

  // PNG: width/height at offset 16/20 (big-endian)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // GIF: little-endian at offset 6/8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }

  // BMP: little-endian at offset 18/22
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: bytes.readUInt32LE(18), height: bytes.readUInt32LE(22) };
  }

  // WebP
  if (bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') {
    const chunkType = bytes.slice(12, 16).toString('ascii');
    if (chunkType === 'VP8 ' && bytes.length >= 30) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff
      };
    }
    if (chunkType === 'VP8L' && bytes.length >= 25) {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunkType === 'VP8X' && bytes.length >= 30) {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3)
      };
    }
  }

  // JPEG: scan SOF markers
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }

  return null;
}

function normalizeDetections(parsed, imageSize) {
  const objects = Array.isArray(parsed?.objects) ? parsed.objects : [];
  return objects
    .map((item) => {
      const label = String(item.label || item.name || '').trim();
      if (!label) return null;

      const confidence = Number(item.confidence);
      const normalizedConfidence = Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0;

      const rawBox = item.box || item.bbox || {};
      const toNum = (value, fallback) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
      };

      let box = null;
      if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
        const x1 = Math.round(toNum(rawBox.x1, 0) * imageSize.width);
        const y1 = Math.round(toNum(rawBox.y1, 0) * imageSize.height);
        const x2 = Math.round(toNum(rawBox.x2, 1) * imageSize.width);
        const y2 = Math.round(toNum(rawBox.y2, 1) * imageSize.height);
        box = {
          x1,
          y1,
          x2,
          y2,
          width: Math.max(x2 - x1, 0),
          height: Math.max(y2 - y1, 0)
        };
      }

      return { label, confidence: normalizedConfidence, box };
    })
    .filter(Boolean);
}

function extractStructuredReport(answer) {
  const trimmed = String(answer || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function detectWithYolo(imageBase64) {
  const imageSize = parseImageSizeFromBase64(imageBase64);

  const result = await askAssistant({
    imageBase64,
    query: '请仔细观察这张图片，输出主要目标检测信息。严格只返回 JSON，不要输出 Markdown 或其他文字。JSON 结构：{"summary":"一句话中文识别摘要","objects":[{"label":"物体名称(中文)","confidence":0.9,"box":{"x1":0.1,"y1":0.1,"x2":0.8,"y2":0.9}}]}。其中 box 为归一化坐标（0-1）。如果没有明显物体，objects 返回空数组。'
  });

  const parsed = extractStructuredReport(result.answer);

  if (!parsed) {
    return {
      summary: '已完成图片识别，并生成视觉分析报告。',
      detections: [],
      imageSize,
      model: result.model || env.bwaiModel,
      fallbackAnswer: result.answer || '未获取到有效识别结果',
      fallbackReason: ''
    };
  }

  return {
    summary: parsed.summary || `识别到 ${parsed.objects?.length || 0} 个主要目标。`,
    detections: normalizeDetections(parsed, imageSize),
    imageSize,
    model: result.model || env.bwaiModel,
    fallbackAnswer: result.answer || '未获取到有效识别结果',
    fallbackReason: ''
  };
}
