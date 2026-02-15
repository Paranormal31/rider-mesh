import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express from 'express';

import { createAlertsRouter } from './routes/alerts';
import { createHealthRouter } from './routes/health';
import { createRidersRouter } from './routes/riders';
import type { AlertRecord, CreateAlertPersistenceInput } from './types/alert';
import type { DatabaseHealth } from './types/health';
import type { RiderPresenceRecord } from './types/rider';

interface CreateAppDeps {
  getDbHealth: () => DatabaseHealth;
  createAlert: (input: CreateAlertPersistenceInput) => Promise<AlertRecord>;
  acceptAlert?: (input: {
    alertId: string;
    responderDeviceId: string;
    assignedAt: number;
  }) => Promise<
    | { ok: true; record: AlertRecord }
    | { ok: false; code: 'ALERT_NOT_FOUND' | 'ALERT_ALREADY_ASSIGNED' | 'ALERT_NOT_CLAIMABLE'; record: AlertRecord | null }
  >;
  upsertHeartbeat?: (input: {
    deviceId: string;
    latitude: number;
    longitude: number;
    timestamp: number;
  }) => Promise<RiderPresenceRecord>;
  onAlertCreated?: (alert: AlertRecord) => Promise<void> | void;
  onAlertAssigned?: (alert: AlertRecord) => Promise<void> | void;
  now: () => Date;
  uptimeSec: () => number;
  corsOrigins: string[];
}

export function createApp({
  getDbHealth,
  createAlert,
  acceptAlert,
  upsertHeartbeat,
  onAlertCreated,
  onAlertAssigned,
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

  const acceptAlertImpl =
    acceptAlert ??
    (async () => ({
      ok: false as const,
      code: 'ALERT_NOT_CLAIMABLE' as const,
      record: null,
    }));
  const upsertHeartbeatImpl =
    upsertHeartbeat ??
    (async () => ({
      id: '',
      deviceId: '',
      latitude: 0,
      longitude: 0,
      timestamp: 0,
      lastSeenAt: 0,
      updatedAt: 0,
      createdAt: 0,
    }));

  app.use(express.json());
  app.use(createHealthRouter({ getDbHealth, now, uptimeSec }));
  app.use(
    createAlertsRouter({
      nowMs: () => now().getTime(),
      createAlert,
      acceptAlert: acceptAlertImpl,
      onAlertCreated,
      onAlertAssigned,
    })
  );
  app.use(
    createRidersRouter({
      nowMs: () => now().getTime(),
      upsertHeartbeat: upsertHeartbeatImpl,
    })
  );

  return app;
}
