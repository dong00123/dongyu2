import { createTravelHistory } from '../repositories/travelHistoryRepository.js';
import { generateTravelPlan } from '../services/travel/travelPlannerService.js';

export async function createTravelPlan(req, res) {
  const result = await generateTravelPlan(req.body || {});
  let historyId = null;

  if (req.auth?.user) {
    historyId = createTravelHistory(req.auth.user.id, req.body || {}, result);
  }

  res.json({
    ...result,
    historyId
  });
}
