import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/env.js';
import apiRoutes from './routes/apiRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { attachAuthContext } from './middleware/authContext.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.static(env.publicPath));
  app.use(express.json({ limit: '10mb' }));
  app.use(attachAuthContext);

  app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(env.publicPath, 'index.html'));
  });

  app.use('/api', apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
