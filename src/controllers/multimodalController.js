import { AppError } from '../core/AppError.js';
import {
  getMultimodalTaskDetail,
  getMultimodalTasks,
  processMultimodalFile
} from '../services/multimodal/multimodalProcessingService.js';

export async function createMultimodalTask(req, res) {
  const payload = req.body || {};
  const result = await processMultimodalFile({
    ...payload,
    userId: req.auth?.user?.id || ''
  });
  res.json(result);
}

export function listMultimodalTask(req, res) {
  const limit = Math.min(Number(req.query.limit || 20), 50);
  res.json({ items: getMultimodalTasks(limit) });
}

export function getMultimodalTask(req, res) {
  const task = getMultimodalTaskDetail(req.params.id);
  if (!task) {
    throw new AppError('多模态任务不存在', 404);
  }
  res.json(task);
}
