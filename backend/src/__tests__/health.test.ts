import { describe, expect, it } from 'vitest';

import { buildHealthResponse, createHealthRouter } from '../routes/health';
import type { DatabaseHealth } from '../types/health';

function buildDbHealth(connected: boolean): DatabaseHealth {
  return {
    connected,
    readyStateCode: connected ? 1 : 0,
    readyState: connected ? 'connected' : 'disconnected',
    dbName: connected ? 'alerts' : undefined,
    host: connected ? 'cluster.example.mongodb.net' : undefined,
  };
}

describe('health endpoints', () => {
  it('returns 200 and ok status when database is connected', () => {
    const response = buildHealthResponse({
      getDbHealth: () => buildDbHealth(true),
      now: () => new Date('2026-02-14T12:00:00.000Z'),
      uptimeSec: () => 11.5,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('alert-api-sms-backend');
    expect(response.body.timestamp).toBe('2026-02-14T12:00:00.000Z');
    expect(response.body.uptimeSec).toBe(11.5);
    expect(response.body.database.connected).toBe(true);
    expect(response.body.database.readyStateCode).toBe(1);
    expect(response.body.database.readyState).toBe('connected');
  });

  it('returns 503 and degraded status when database is disconnected', () => {
    const response = buildHealthResponse({
      getDbHealth: () => buildDbHealth(false),
      now: () => new Date('2026-02-14T12:00:00.000Z'),
      uptimeSec: () => 1.2,
    });

    expect(response.statusCode).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.database.connected).toBe(false);
    expect(response.body.database.readyStateCode).toBe(0);
    expect(response.body.database.readyState).toBe('disconnected');
  });

  it('registers both /health and /api/v1/health routes', () => {
    const router = createHealthRouter({
      getDbHealth: () => buildDbHealth(true),
      now: () => new Date('2026-02-14T12:00:00.000Z'),
      uptimeSec: () => 22,
    });

    const routes = ((router as unknown as { stack?: Array<{ route?: { path?: string } }> }).stack ?? [])
      .map((layer) => layer.route?.path)
      .filter((path): path is string => Boolean(path));

    expect(routes).toContain('/health');
    expect(routes).toContain('/api/v1/health');
  });

  it('uses process-level uptime provider across health evaluations', () => {
    let uptime = 10;

    const deps = {
      getDbHealth: () => buildDbHealth(true),
      now: () => new Date('2026-02-14T12:00:00.000Z'),
      uptimeSec: () => {
        uptime += 1;
        return uptime;
      },
    };

    const first = buildHealthResponse(deps);
    const second = buildHealthResponse(deps);

    expect(second.body.uptimeSec).toBeGreaterThan(first.body.uptimeSec);
  });
});
