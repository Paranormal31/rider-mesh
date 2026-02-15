import { type RequestHandler, Router } from 'express';

import type { DatabaseHealth, HealthResponse } from '../types/health';

export interface HealthRouteDeps {
  getDbHealth: () => DatabaseHealth;
  now: () => Date;
  uptimeSec: () => number;
}

const SERVICE_NAME: HealthResponse['service'] = 'alert-api-sms-backend';

export function buildHealthResponse({ getDbHealth, now, uptimeSec }: HealthRouteDeps): {
  statusCode: number;
  body: HealthResponse;
} {
  const database = getDbHealth();
  return {
    statusCode: database.connected ? 200 : 503,
    body: {
      status: database.connected ? 'ok' : 'degraded',
      service: SERVICE_NAME,
      timestamp: now().toISOString(),
      uptimeSec: uptimeSec(),
      database,
    },
  };
}

export function createHealthRouter({ getDbHealth, now, uptimeSec }: HealthRouteDeps): Router {
  const router = Router();

  const handler: RequestHandler = (_req, res) => {
    const response = buildHealthResponse({ getDbHealth, now, uptimeSec });
    res.status(response.statusCode).json(response.body);
  };

  router.get('/health', handler);
  router.get('/api/v1/health', handler);

  return router;
}
