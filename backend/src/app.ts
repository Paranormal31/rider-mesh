import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express from 'express';

import { createAlertsRouter } from './routes/alerts';
import { createHazardsRouter } from './routes/hazards';
import { createHealthRouter } from './routes/health';
import { createRidersRouter } from './routes/riders';
import { createRidesRouter } from './routes/rides';
import type { AlertRecord, CreateAlertPersistenceInput } from './types/alert';
import type { DatabaseHealth } from './types/health';
import type { CreateHazardInput, HazardRecord } from './types/hazard';
import type { RiderPresenceRecord } from './types/rider';
import type { EndRideInput, RideRecord, StartRideInput } from './types/ride';

interface CreateAppDeps {
  getDbHealth: () => DatabaseHealth;
  createAlert: (input: CreateAlertPersistenceInput) => Promise<AlertRecord>;
  updateAlertStatus?: (
    alertId: string,
    status: 'CANCELLED' | 'ESCALATED'
  ) => Promise<
    | { kind: 'updated'; data: Pick<AlertRecord, 'id' | 'status' | 'updatedAt'> }
    | { kind: 'not_found' }
    | { kind: 'blocked'; currentStatus: AlertRecord['status'] }
  >;
  acceptAlert?: (input: {
    alertId: string;
    responderDeviceId: string;
    responderName?: string | null;
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
  onAlertStatusUpdated?: (input: {
    alertId: string;
    status: 'CANCELLED' | 'ESCALATED';
    updatedAt: number;
  }) => Promise<void> | void;
  listHazards?: () => Promise<HazardRecord[]>;
  createHazard?: (input: CreateHazardInput) => Promise<HazardRecord>;
  removeHazard?: (hazardId: string) => Promise<{ removed: boolean }>;
  onHazardCreated?: (hazard: HazardRecord) => Promise<void> | void;
  onHazardRemoved?: (hazardId: string) => Promise<void> | void;
  startRide?: (input: StartRideInput) => Promise<RideRecord>;
  endRide?: (input: EndRideInput) => Promise<RideRecord | null>;
  listRidesForDevice?: (deviceId: string) => Promise<RideRecord[]>;
  now: () => Date;
  uptimeSec: () => number;
  corsOrigins: string[];
}

export function createApp({
  getDbHealth,
  createAlert,
  updateAlertStatus,
  acceptAlert,
  upsertHeartbeat,
  onAlertCreated,
  onAlertAssigned,
  onAlertStatusUpdated,
  listHazards,
  createHazard,
  removeHazard,
  onHazardCreated,
  onHazardRemoved,
  startRide,
  endRide,
  listRidesForDevice,
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
  const updateAlertStatusImpl =
    updateAlertStatus ??
    (async () => ({
      kind: 'not_found' as const,
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
  const listHazardsImpl = listHazards ?? (async () => []);
  const createHazardImpl =
    createHazard ??
    (async (input) => ({
      id: '',
      type: input.type,
      latitude: input.latitude,
      longitude: input.longitude,
      createdAt: 0,
      updatedAt: 0,
    }));
  const removeHazardImpl = removeHazard ?? (async () => ({ removed: false }));
  const startRideImpl =
    startRide ??
    (async (input) => ({
      id: '',
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      status: 'ACTIVE',
      startedAt: input.startedAt,
      endedAt: null,
      durationMs: null,
      distanceKm: 0,
      fatigueWarnings: 0,
      hazardsReported: 0,
      sosTriggered: 0,
      createdAt: 0,
      updatedAt: 0,
    }));
  const endRideImpl = endRide ?? (async () => null);
  const listRidesForDeviceImpl = listRidesForDevice ?? (async () => []);

  app.use(express.json());
  app.use(createHealthRouter({ getDbHealth, now, uptimeSec }));
  app.use(
    createAlertsRouter({
      nowMs: () => now().getTime(),
      createAlert,
      updateAlertStatus: updateAlertStatusImpl,
      acceptAlert: acceptAlertImpl,
      onAlertCreated,
      onAlertAssigned,
      onAlertStatusUpdated,
    })
  );
  app.use(
    createRidersRouter({
      nowMs: () => now().getTime(),
      upsertHeartbeat: upsertHeartbeatImpl,
    })
  );
  app.use(
    createHazardsRouter({
      listHazards: listHazardsImpl,
      createHazard: createHazardImpl,
      removeHazard: removeHazardImpl,
      onHazardCreated,
      onHazardRemoved,
    })
  );
  app.use(
    createRidesRouter({
      nowMs: () => now().getTime(),
      startRide: startRideImpl,
      endRide: endRideImpl,
      listRidesForDevice: listRidesForDeviceImpl,
    })
  );

  return app;
}
