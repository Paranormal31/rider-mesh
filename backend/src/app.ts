import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express from 'express';

import { createAlertsRouter } from './routes/alerts';
import { createHealthRouter } from './routes/health';
import type { AlertRecord, CreateAlertPersistenceInput } from './types/alert';
import type { DatabaseHealth } from './types/health';

interface CreateAppDeps {
  getDbHealth: () => DatabaseHealth;
  createAlert: (input: CreateAlertPersistenceInput) => Promise<AlertRecord>;
  updateAlertStatus: (
    id: string,
    status: 'CANCELLED' | 'ESCALATED'
  ) => Promise<
    | { kind: 'updated'; data: Pick<AlertRecord, 'id' | 'status' | 'updatedAt'> }
    | { kind: 'not_found' }
    | { kind: 'blocked'; currentStatus: CreateAlertPersistenceInput['status'] }
  >;
  now: () => Date;
  uptimeSec: () => number;
  corsOrigins: string[];
}

export function createApp({
  getDbHealth,
  createAlert,
  updateAlertStatus,
  now,
  uptimeSec,
  corsOrigins,
}: CreateAppDeps) {
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

  app.use((_request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  });

  app.use(express.json());
  app.use(createHealthRouter({ getDbHealth, now, uptimeSec }));
  app.use(
    createAlertsRouter({
      nowMs: () => now().getTime(),
      createAlert,
      updateAlertStatus,
    })
  );

  return app;
}
