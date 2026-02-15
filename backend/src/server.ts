import type { Server } from 'node:http';
import { createServer } from 'node:http';

import { createApp } from './app';
import { connectToDatabase, disconnectFromDatabase, readDbHealth } from './config/db';
import { acceptAlertRecord, createAlertRecord, updateAlertStatusRecord } from './models/alert';
import { listActiveRiders, upsertRiderHeartbeat } from './models/rider';
import { findNearbyRidersForAlert } from './services/dispatchService';
import { SocketHub } from './socket/hub';
import { loadEnv } from './config/env';

const processStartedAtMs = Date.now();
const RIDER_ACTIVE_WINDOW_MS = 60_000;
const DISPATCH_RADIUS_METERS = 1_000;

function processUptimeSec(): number {
  return Math.max(0, Number(((Date.now() - processStartedAtMs) / 1000).toFixed(3)));
}

function loadEnvOrExit(): ReturnType<typeof loadEnv> {
  try {
    return loadEnv();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[startup] Invalid environment configuration: ${reason}`);
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  const env = loadEnvOrExit();
  const socketHub = new SocketHub();

  try {
    await connectToDatabase(env.mongodbUri);
    const db = readDbHealth();
    console.log(
      `[startup] MongoDB connected (state=${db.readyState}/${db.readyStateCode}, db=${db.dbName ?? 'unknown'}, host=${db.host ?? 'unknown'})`
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[startup] Failed to connect to MongoDB: ${reason}`);
    process.exit(1);
  }

  const app = createApp({
    getDbHealth: readDbHealth,
    createAlert: createAlertRecord,
    updateAlertStatus: (alertId, status) => updateAlertStatusRecord({ alertId, status }),
    acceptAlert: acceptAlertRecord,
    upsertHeartbeat: upsertRiderHeartbeat,
    onAlertCreated: async (alert) => {
      const riders = await listActiveRiders(Date.now() - RIDER_ACTIVE_WINDOW_MS);
      const nearbyMatches = findNearbyRidersForAlert({
        alert,
        riders,
        radiusMeters: DISPATCH_RADIUS_METERS,
      });
      console.log('[dispatch] nearby riders matched', {
        alertId: alert.id,
        victimDeviceId: alert.deviceId,
        candidateRiders: riders.length,
        matchedRiders: nearbyMatches.length,
        matches: nearbyMatches.map((match) => ({
          deviceId: match.deviceId,
          distanceMeters: Math.round(match.distanceMeters),
        })),
      });
      socketHub.emitNearbyAlert(alert, nearbyMatches);
    },
    onAlertAssigned: (alert) => {
      socketHub.emitAlertAssigned(alert);
    },
    onAlertStatusUpdated: (input) => {
      if (input.status === 'CANCELLED') {
        socketHub.emitAlertCancelled({
          alertId: input.alertId,
          cancelledAt: input.updatedAt,
        });
      }
    },
    now: () => new Date(),
    uptimeSec: processUptimeSec,
    corsOrigins: env.corsOrigins,
  });

  const server = createServer(app);
  socketHub.init(server, env.corsOrigins);

  server.listen(env.port, () => {
    console.log(`[startup] Backend listening on http://localhost:${env.port}`);
  });

  registerShutdown(server);
}

function registerShutdown(server: Server): void {
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`[shutdown] Received ${signal}, closing server...`);
    server.close(async () => {
      try {
        await disconnectFromDatabase();
        console.log('[shutdown] MongoDB disconnected.');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[shutdown] Failed to disconnect MongoDB cleanly: ${reason}`);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrap();
