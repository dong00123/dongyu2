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
            detections.append(
                {
                    "label": label,
                    "confidence": round(confidence, 4),
                    "box": convert_box(box),
                }
            )

    detections.sort(key=lambda item: item["confidence"], reverse=True)

    summary = "未检测到明显目标。"
    if detections:
        top_labels = [item["label"] for item in detections[:5]]
        summary = f"检测到 {len(detections)} 个目标，主要包括：{'、'.join(top_labels)}。"

    return {
        "summary": summary,
        "detections": detections,
        "image_size": {"width": image.width, "height": image.height},
        "model": os.getenv("YOLO_MODEL_PATH", "yolov8n.pt"),
    }
