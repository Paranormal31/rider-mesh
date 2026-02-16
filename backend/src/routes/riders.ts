import { randomUUID } from 'node:crypto';

import { type RequestHandler, type Response, Router } from 'express';

import type { RiderPresenceRecord } from '../types/rider';

interface CreateRidersRouterDeps {
  nowMs: () => number;
  upsertHeartbeat: (input: {
    deviceId: string;
    latitude: number;
    longitude: number;
    timestamp: number;
  }) => Promise<RiderPresenceRecord>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveRequestId(response: Response): string {
  const requestId = response.locals.requestId;
  if (typeof requestId === 'string' && requestId.length > 0) {
    return requestId;
  }

  const fallbackId = randomUUID();
  response.locals.requestId = fallbackId;
  return fallbackId;
}

function validateHeartbeatPayload(payload: unknown, nowMs: number): {
  ok: true;
  value: {
    deviceId: string;
    latitude: number;
    longitude: number;
    timestamp: number;
  };
} | {
  ok: false;
  message: string;
} {
  if (!isPlainObject(payload)) {
    return { ok: false, message: 'Request body must be an object.' };
  }

  const deviceIdRaw = payload.deviceId;
  const locationRaw = payload.location;
  if (typeof deviceIdRaw !== 'string' || !deviceIdRaw.trim()) {
    return { ok: false, message: 'deviceId must be a non-empty string.' };
  }

  if (!isPlainObject(locationRaw)) {
    return { ok: false, message: 'location must be an object.' };
  }

  const latitude = locationRaw.latitude;
  const longitude = locationRaw.longitude;
  const timestamp = locationRaw.timestamp as unknown;
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
    return { ok: false, message: 'location.latitude must be between -90 and 90.' };
  }
  if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    return { ok: false, message: 'location.longitude must be between -180 and 180.' };
  }
  if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp <= 0) {
    return { ok: false, message: 'location.timestamp must be a valid Unix ms integer.' };
  }
  if (timestamp > nowMs + 5 * 60 * 1000) {
    return { ok: false, message: 'location.timestamp cannot be more than 5 minutes in the future.' };
  }

  return {
    ok: true,
    value: {
      deviceId: deviceIdRaw.trim(),
      latitude,
      longitude,
      timestamp: timestamp,
    },
  };
}

export function createRidersRouter({ nowMs, upsertHeartbeat }: CreateRidersRouterDeps): Router {
  const router = Router();

  const heartbeatHandler: RequestHandler = async (request, response) => {
    const requestId = resolveRequestId(response);
    const validation = validateHeartbeatPayload(request.body, nowMs());

    if (!validation.ok) {
      response.status(400).json({
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.message,
        },
      });
      return;
    }

    try {
      await upsertHeartbeat(validation.value);

      response.status(200).json({
        requestId,
        data: {
          deviceId: validation.value.deviceId,
          receivedAt: nowMs(),
        },
      });
    } catch {
      response.status(500).json({
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update rider heartbeat',
        },
      });
    }
  };

  router.post('/api/v1/riders/heartbeat', heartbeatHandler);

  return router;
}
