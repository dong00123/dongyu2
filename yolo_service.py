from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover
    YOLO = None

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


class DetectRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 图片数据")


@dataclass
class DetectionItem:
    label: str
    confidence: float
    box: dict[str, float]


_model: Any | None = None


def load_model() -> Any:
    global _model

    if _model is not None:
        return _model

    model_path = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
    if YOLO is None:
        raise RuntimeError("ultralytics 未安装，无法加载 YOLOv8 模型")

    _model = YOLO(model_path)
    return _model


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


def convert_box(box: Any) -> dict[str, float]:
    coords = box.xyxy[0].tolist()
    return {
        "x1": round(float(coords[0]), 2),
        "y1": round(float(coords[1]), 2),
        "x2": round(float(coords[2]), 2),
        "y2": round(float(coords[3]), 2),
        "width": round(float(coords[2] - coords[0]), 2),
        "height": round(float(coords[3] - coords[1]), 2),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/detect")
def detect(request: DetectRequest) -> dict[str, Any]:
    image = decode_image(request.image_base64)

    try:
        model = load_model()
        result = model.predict(image, verbose=False)[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"YOLOv8 推理失败: {exc}") from exc

    names = result.names or {}
    detections: list[dict[str, Any]] = []

    boxes = getattr(result, "boxes", None)
    if boxes is not None:
        for box in boxes:
            cls_id = int(box.cls[0])
            confidence = float(box.conf[0])
            label = names.get(cls_id, f"class_{cls_id}")
            label_zh = COCO_NAMES_ZH.get(label, label)
            detections.append(
                {
                    "label": label,
                    "label_zh": label_zh,
                    "confidence": round(confidence, 4),
                    "box": convert_box(box),
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
        "image_size": {"width": image.width, "height": image.height},
        "model": os.getenv("YOLO_MODEL_PATH", "yolov8n.pt"),
    }
