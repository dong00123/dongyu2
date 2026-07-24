import { AppError } from '../core/AppError.js';
import { listTravelHistory, setFavoriteTravelHistory } from '../repositories/travelHistoryRepository.js';

function requireUser(req) {
  if (!req.auth?.user) {
    throw new AppError('请先登录', 401);
  }

  return req.auth.user;
}

export function getTravelHistory(req, res) {
  const user = requireUser(req);
  res.json({
    list: listTravelHistory(user.id, 30)
  });
}

export function toggleFavoriteHistory(req, res) {
  const user = requireUser(req);
  const historyId = req.params.id;
  const favorite = Boolean(req.body?.favorite);
  setFavoriteTravelHistory(user.id, historyId, favorite);
  res.json({ ok: true });
}
