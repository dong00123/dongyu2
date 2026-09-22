const YOLO_SERVICE_URL = process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:8001';
const YOLO_TIMEOUT_MS = 30000;

function normalizeDetections(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item.label || '').trim() || 'unknown';
      const labelZh = String(item.label_zh || '').trim() || label;
      const confidence = Number(item.confidence);
      const box = item.box && typeof item.box === 'object' ? item.box : null;
      if (!box) return null;
      return {
        label,
        label_zh: labelZh,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        box
      };
    })
    .filter(Boolean);
}

export async function detectWithYolo(imageBase64) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOLO_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${YOLO_SERVICE_URL}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`YOLO 识别服务响应超时（${YOLO_TIMEOUT_MS}ms），请检查 Python 推理服务是否启动`);
    }
    throw new Error(`YOLO 识别服务不可达（${YOLO_SERVICE_URL}）：${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error(`YOLO 识别服务返回异常内容（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    throw new Error(data.detail || `YOLO 识别服务错误（HTTP ${response.status}）`);
  }

  const detections = normalizeDetections(data.detections);

  return {
    summary:
      data.summary ||
      (detections.length > 0
        ? `检测到 ${detections.length} 个目标。`
        : '图片中未识别到明显可检测的主要目标物体。'),
    detections,
    imageSize: data.image_size || null,
    model: data.model || 'yolov8n.pt',
    fallbackAnswer: '',
    fallbackReason: ''
  };
}
