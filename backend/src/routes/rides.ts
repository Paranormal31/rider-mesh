import { randomUUID } from 'node:crypto';

import { type RequestHandler, type Response, Router } from 'express';

import type { EndRideInput, RideRecord, StartRideInput } from '../types/ride';

interface CreateRidesRouterDeps {
  nowMs: () => number;
  startRide: (input: StartRideInput) => Promise<RideRecord>;
  endRide: (input: EndRideInput) => Promise<RideRecord | null>;
  listRidesForDevice: (deviceId: string) => Promise<RideRecord[]>;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStartPayload(payload: unknown, nowMs: number): {
  ok: true;
  value: StartRideInput;
} | {
  ok: false;
  message: string;
} {
  if (!isPlainObject(payload)) {
    return { ok: false, message: 'Request body must be an object.' };
  }

  if (typeof payload.deviceId !== 'string' || !payload.deviceId.trim()) {
    return { ok: false, message: 'deviceId must be a non-empty string.' };
  }
  if (typeof payload.sessionId !== 'string' || !payload.sessionId.trim()) {
    return { ok: false, message: 'sessionId must be a non-empty string.' };
  }
  if (typeof payload.startedAt !== 'number' || !Number.isInteger(payload.startedAt) || payload.startedAt <= 0) {
    return { ok: false, message: 'startedAt must be a valid Unix ms integer.' };
  }
  if (payload.startedAt > nowMs + 5 * 60 * 1000) {
    return { ok: false, message: 'startedAt cannot be more than 5 minutes in the future.' };
  }

  return {
    ok: true,
    value: {
      deviceId: payload.deviceId.trim(),
      sessionId: payload.sessionId.trim(),
      startedAt: payload.startedAt,
    },
  };
}

function validateEndPayload(payload: unknown, nowMs: number): {
  ok: true;
  value: Omit<EndRideInput, 'rideId'>;
} | {
  ok: false;
  message: string;
} {
  if (!isPlainObject(payload)) {
    return { ok: false, message: 'Request body must be an object.' };
  }

  if (typeof payload.endedAt !== 'number' || !Number.isInteger(payload.endedAt) || payload.endedAt <= 0) {
    return { ok: false, message: 'endedAt must be a valid Unix ms integer.' };
  }
  if (payload.endedAt > nowMs + 5 * 60 * 1000) {
    return { ok: false, message: 'endedAt cannot be more than 5 minutes in the future.' };
  }

  const numericFields: Array<keyof Omit<EndRideInput, 'rideId' | 'endedAt'>> = [
    'distanceKm',
    'fatigueWarnings',
    'hazardsReported',
    'sosTriggered',
  ];
  const normalized: Record<string, number> = {};
  for (const field of numericFields) {
    const raw = payload[field];
    if (typeof raw !== 'number' || Number.isNaN(raw) || raw < 0) {
      return { ok: false, message: `${field} must be a non-negative number.` };
    }
    normalized[field] = raw;
  }

  return {
    ok: true,
    value: {
      endedAt: payload.endedAt,
      distanceKm: normalized.distanceKm,
      fatigueWarnings: normalized.fatigueWarnings,
      hazardsReported: normalized.hazardsReported,
      sosTriggered: normalized.sosTriggered,
    },
  };
}

export function createRidesRouter({ nowMs, startRide, endRide, listRidesForDevice }: CreateRidesRouterDeps): Router {
  const router = Router();

  const startHandler: RequestHandler = async (request, response) => {
    const requestId = resolveRequestId(response);
    const validation = validateStartPayload(request.body, nowMs());
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
      const record = await startRide(validation.value);
      response.status(201).json({ requestId, data: record });
    } catch {
      response.status(500).json({
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to start ride.',
        },
      });
    }
  };

  const endHandler: RequestHandler = async (request, response) => {
    const requestId = resolveRequestId(response);
    const validation = validateEndPayload(request.body, nowMs());
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
      const record = await endRide({
        rideId: request.params.id,
        ...validation.value,
      });
      if (!record) {
        response.status(404).json({
          requestId,
          error: {
            code: 'RIDE_NOT_FOUND',
            message: 'Ride not found or already ended.',
          },
        });
        return;
      }
      response.status(200).json({ requestId, data: record });
    } catch {
      response.status(500).json({
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to end ride.',
        },
      });
    }
  };

  const listHandler: RequestHandler = async (request, response) => {
    const requestId = resolveRequestId(response);
    const deviceIdRaw = request.query.deviceId;
    const deviceId = typeof deviceIdRaw === 'string' ? deviceIdRaw.trim() : '';
    if (!deviceId) {
      response.status(400).json({
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'deviceId query parameter is required.',
        },
      });
      return;
    }

    try {
      const rides = await listRidesForDevice(deviceId);
      response.status(200).json({ requestId, data: rides });
    } catch {
      response.status(500).json({
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list rides.',
        },
      });
    }
  };

  router.post('/api/v1/rides/start', startHandler);
  router.post('/api/v1/rides/:id/end', endHandler);
  router.get('/api/v1/rides', listHandler);

  return router;
}
