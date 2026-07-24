import { getEnvSummary } from '../config/env.js';

export function getHealth(req, res) {
  res.json({
    ok: true,
    ...getEnvSummary()
  });
}
