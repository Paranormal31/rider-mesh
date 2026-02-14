import type { Server } from 'node:http';

import { createApp } from './app';
import { connectToDatabase, disconnectFromDatabase, readDbHealth } from './config/db';
import { loadEnv } from './config/env';

const processStartedAtMs = Date.now();

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
    now: () => new Date(),
    uptimeSec: processUptimeSec,
    corsOrigins: env.corsOrigins,
  });

  const server = app.listen(env.port, () => {
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
