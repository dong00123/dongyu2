from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from typing import Any

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field

COCO_NAMES_ZH = {
    "person": "人", "bicycle": "自行车", "car": "汽车", "motorcycle": "摩托车",
    "airplane": "飞机", "bus": "公交车", "train": "火车", "truck": "卡车",
    "boat": "船", "traffic light": "交通信号灯", "fire hydrant": "消防栓",
    "stop sign": "停车标志", "parking meter": "停车计时器", "bench": "长椅",
    "bird": "鸟", "cat": "猫", "dog": "狗", "horse": "马", "sheep": "羊",
    "cow": "牛", "elephant": "大象", "bear": "熊", "zebra": "斑马",
    "giraffe": "长颈鹿", "backpack": "背包", "umbrella": "雨伞",
    "handbag": "手提包", "tie": "领带", "suitcase": "行李箱",
    "frisbee": "飞盘", "skis": "滑雪板", "snowboard": "单板滑雪板",
    "sports ball": "球", "kite": "风筝", "baseball bat": "棒球棒",
    "baseball glove": "棒球手套", "skateboard": "滑板", "surfboard": "冲浪板",
    "tennis racket": "网球拍", "bottle": "瓶子", "wine glass": "酒杯",
    "cup": "杯子", "fork": "叉子", "knife": "刀", "spoon": "勺子",
    "bowl": "碗", "banana": "香蕉", "apple": "苹果", "sandwich": "三明治",
    "orange": "橙子", "broccoli": "西兰花", "carrot": "胡萝卜",
    "hot dog": "热狗", "pizza": "披萨", "donut": "甜甜圈", "cake": "蛋糕",
    "chair": "椅子", "couch": "沙发", "potted plant": "盆栽", "bed": "床",
    "dining table": "餐桌", "toilet": "马桶", "tv": "电视",
    "laptop": "笔记本电脑", "mouse": "鼠标", "remote": "遥控器",
    "keyboard": "键盘", "cell phone": "手机", "microwave": "微波炉",
    "oven": "烤箱", "toaster": "烤面包机", "sink": "水槽",
    "refrigerator": "冰箱", "book": "书", "clock": "钟", "vase": "花瓶",
    "scissors": "剪刀", "teddy bear": "泰迪熊", "hair drier": "吹风机",
    "toothbrush": "牙刷",
}

app = FastAPI(title="Dongyu YOLO Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 置信度/IOU 阈值沿用 ultralytics predict 默认值
CONF_THRES = float(os.getenv("YOLO_CONF_THRES", "0.25"))
IOU_THRES = float(os.getenv("YOLO_IOU_THRES", "0.45"))
INPUT_SIZE = int(os.getenv("YOLO_INPUT_SIZE", "640"))


class DetectRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 图片数据")


@dataclass
class DetectionItem:
    label: str
    confidence: float
    box: dict[str, float]


_session: ort.InferenceSession | None = None


def load_model() -> ort.InferenceSession:
    global _session

    if _session is not None:
        return _session

    model_path = os.getenv("YOLO_MODEL_PATH", "yolov8n.onnx")
    if not os.path.exists(model_path):
        raise RuntimeError(f"ONNX 模型文件不存在: {model_path}")

    so = ort.SessionOptions()
    # CPU 推理，限制内部线程数，降低小内存实例上的资源竞争与峰值内存
    so.intra_op_num_threads = int(os.getenv("ORT_INTRA_OP_NUM_THREADS", "2"))
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    _session = ort.InferenceSession(
        model_path,
        sess_options=so,
        providers=["CPUExecutionProvider"],
    )
    return _session


def decode_image(image_base64: str) -> Image.Image:
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]

    try:
        binary = base64.b64decode(image_base64)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail="图片编码无效") from exc

    try:
        image = Image.open(io.BytesIO(binary))
        return image.convert("RGB")
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail="图片内容无法识别") from exc


def letterbox_image(
    image: Image.Image,
    new_size: int = 640,
    color: tuple[int, int, int] = (114, 114, 114),
) -> tuple[np.ndarray, float, int, int]:
    """等比例缩放 + 灰边填充到 new_size x new_size，返回 (blob, ratio, pad_left, pad_top)"""
    width, height = image.size  # PIL: (w, h)
    ratio = min(new_size / width, new_size / height)
    new_w = int(round(width * ratio))
    new_h = int(round(height * ratio))

    resized = image.resize((new_w, new_h), Image.BILINEAR)
    pad_left = (new_size - new_w) // 2
    pad_top = (new_size - new_h) // 2

    canvas = Image.new("RGB", (new_size, new_size), color)
    canvas.paste(resized, (pad_left, pad_top))

    blob = np.asarray(canvas, dtype=np.float32) / 255.0  # (h, w, 3) 0~1
    blob = blob.transpose(2, 0, 1)[None, ...]  # (1, 3, h, w)
    return blob, ratio, pad_left, pad_top


def xywh_to_xyxy(boxes: np.ndarray) -> np.ndarray:
    """cxcywh -> xyxy（640 输入坐标系）"""
    out = np.empty_like(boxes)
    out[:, 0] = boxes[:, 0] - boxes[:, 2] / 2.0
    out[:, 1] = boxes[:, 1] - boxes[:, 3] / 2.0
    out[:, 2] = boxes[:, 0] + boxes[:, 2] / 2.0
    out[:, 3] = boxes[:, 1] + boxes[:, 3] / 2.0
    return out


def nms(boxes_xyxy: np.ndarray, scores: np.ndarray, iou_thres: float) -> list[int]:
    """标准 NMS，返回保留索引（按置信度降序）"""
    if boxes_xyxy.shape[0] == 0:
        return []

    x1, y1, x2, y2 = boxes_xyxy.T
    areas = np.maximum(0.0, x2 - x1) * np.maximum(0.0, y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []

    while order.size > 0:
        i = int(order[0])
        keep.append(i)

        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        union = areas[i] + areas[order[1:]] - inter + 1e-9
        iou = inter / union

        order = order[1:][iou <= iou_thres]

    return keep


def convert_box(x1: float, y1: float, x2: float, y2: float) -> dict[str, float]:
    return {
        "x1": round(float(x1), 2),
        "y1": round(float(y1), 2),
        "x2": round(float(x2), 2),
        "y2": round(float(y2), 2),
        "width": round(float(x2 - x1), 2),
        "height": round(float(y2 - y1), 2),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/detect")
def detect(request: DetectRequest) -> dict[str, Any]:
    image = decode_image(request.image_base64)
    width, height = image.size

    try:
        session = load_model()
        blob, ratio, pad_left, pad_top = letterbox_image(image, INPUT_SIZE)

        input_name = session.get_inputs()[0].name
        output = session.run(None, {input_name: blob})[0]  # (1, 84, 8400)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"YOLOv8 ONNX 推理失败: {exc}") from exc

    preds = np.asarray(output)[0].T  # (8400, 84): 每行 [cx, cy, w, h] + 80 类分数
    boxes_xywh = preds[:, :4]
    class_scores = preds[:, 4:]

    class_ids = class_scores.argmax(axis=1)
    confidences = class_scores.max(axis=1)

    keep_mask = confidences > CONF_THRES
    if not keep_mask.any():
        return {
            "summary": "未检测到明显目标。",
            "detections": [],
            "image_size": {"width": width, "height": height},
            "model": os.getenv("YOLO_MODEL_PATH", "yolov8n.onnx"),
        }

    boxes_xyxy = xywh_to_xyxy(boxes_xywh[keep_mask])
    confs = confidences[keep_mask]
    ids = class_ids[keep_mask]

    keep_idx = nms(boxes_xyxy, confs, IOU_THRES)

    detections: list[dict[str, Any]] = []
    for idx in keep_idx:
        x1 = (boxes_xyxy[idx][0] - pad_left) / ratio
        y1 = (boxes_xyxy[idx][1] - pad_top) / ratio
        x2 = (boxes_xyxy[idx][2] - pad_left) / ratio
        y2 = (boxes_xyxy[idx][3] - pad_top) / ratio

        # 裁剪到原图边界
        x1 = max(0.0, min(float(x1), float(width)))
        y1 = max(0.0, min(float(y1), float(height)))
        x2 = max(0.0, min(float(x2), float(width)))
        y2 = max(0.0, min(float(y2), float(height)))

        cls_id = int(ids[idx])
        label = COCO_NAMES[cls_id] if cls_id < len(COCO_NAMES) else f"class_{cls_id}"
        label_zh = COCO_NAMES_ZH.get(label, label)
        detections.append(
            {
                "label": label,
                "label_zh": label_zh,
                "confidence": round(float(confs[idx]), 4),
                "box": convert_box(x1, y1, x2, y2),
            }
        )

    detections.sort(key=lambda item: item["confidence"], reverse=True)

    summary = "未检测到明显目标。"
    if detections:
        top_labels = [item.get("label_zh") or item["label"] for item in detections[:5]]
        summary = f"检测到 {len(detections)} 个目标，主要包括：{'、'.join(top_labels)}。"

    return {
        "summary": summary,
        "detections": detections,
        "image_size": {"width": width, "height": height},
        "model": os.getenv("YOLO_MODEL_PATH", "yolov8n.onnx"),
    }


# COCO 80 类英文标签（ultralytics coco.yaml 顺序），与 COCO_NAMES_ZH 键对应
COCO_NAMES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
    "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag",
    "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana",
    "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza",
    "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table",
    "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock",
    "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
]
