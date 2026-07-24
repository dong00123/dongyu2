import fs from 'fs';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger.js';

const app = createApp();

app.listen(env.port, () => {
  logger.info(`${env.appName} is running`, {
    url: `http://localhost:${env.port}`,
    publicPath: env.publicPath
  });

  if (fs.existsSync(env.envFilePath)) {
    logger.info('Loaded local env from .env.local');
  }
});

export default app;
