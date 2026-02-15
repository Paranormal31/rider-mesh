import cors from 'cors';
import express from 'express';

import { createHealthRouter } from './routes/health';
import type { DatabaseHealth } from './types/health';

interface CreateAppDeps {
  getDbHealth: () => DatabaseHealth;
  now: () => Date;
  uptimeSec: () => number;
  corsOrigins: string[];
}

export function createApp({ getDbHealth, now, uptimeSec, corsOrigins }: CreateAppDeps) {
  const app = express();

  const allowedOrigins = new Set(corsOrigins);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
    })
  );

  app.use(express.json());
  app.use(createHealthRouter({ getDbHealth, now, uptimeSec }));

  return app;
}
