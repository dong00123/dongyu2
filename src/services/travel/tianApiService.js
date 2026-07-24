import { env } from '../../config/env.js';
import { defaultHttpClient } from '../../config/http.js';
import { logger } from '../../core/logger.js';

export async function getFlightsByTianApi(depCity, arrCity, date) {
  if (!env.tianapiKey) return [];

  try {
    const response = await defaultHttpClient.get('http://api.tianapi.com/travelflight/index', {
      params: {
        key: env.tianapiKey,
        depcity: depCity,
        arrcity: arrCity,
        date
      }
    });

    return response.data?.result?.list || [];
  } catch (error) {
    logger.warn('航班接口调用失败', { message: error.message });
    return [];
  }
}

export async function getTrainTicketsByTianApi(start, end, date) {
  if (!env.tianapiKey) return [];

  try {
    const response = await defaultHttpClient.get('http://api.tianapi.com/train/index', {
      params: {
        key: env.tianapiKey,
        start,
        end,
        date
      }
    });

    return response.data?.result?.list || [];
  } catch (error) {
    logger.warn('火车票接口调用失败', { message: error.message });
    return [];
  }
}
