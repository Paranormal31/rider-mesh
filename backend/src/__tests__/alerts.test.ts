import { describe, expect, it, vi } from 'vitest';

import { createAlertsRouter, processCreateAlertRequest } from '../routes/alerts';
import type { AlertLocation, AlertRecord, CreateAlertPersistenceInput } from '../types/alert';

const FIXED_NOW_MS = 1_739_555_556_000;
const VALID_TRIGGERED_AT = FIXED_NOW_MS - 10_000;

function buildLocation(overrides?: Partial<AlertLocation>): AlertLocation {
  return {
    latitude: 28.6139,
    longitude: 77.209,
    timestamp: VALID_TRIGGERED_AT - 1000,
    breadcrumbTrail: [
      {
        latitude: 28.6138,
        longitude: 77.2088,
        timestamp: VALID_TRIGGERED_AT - 2000,
      },
    ],
    ...overrides,
  };
}

function buildPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    deviceId: 'device-123',
    status: 'TRIGGERED',
    triggeredAt: VALID_TRIGGERED_AT,
    location: buildLocation(),
    ...overrides,
  };
}

function buildAlertRecord(input: CreateAlertPersistenceInput): AlertRecord {
  return {
    id: '67b07e7f6d4a9b7a8b9957d1',
    deviceId: input.deviceId,
    status: input.status,
    triggeredAt: input.triggeredAt,
    location: input.location,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  };
}

describe('alerts contract', () => {
  it('201 when payload is valid with full location object', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: buildPayload(),
      requestId: 'req-success-location',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(201);
    if (result.statusCode !== 201) {
      throw new Error('Expected 201 response');
    }

    expect(result.body.requestId).toBe('req-success-location');
    expect(result.body.data.location).toEqual(buildLocation());
    expect(createAlert).toHaveBeenCalledTimes(1);
  });

  it('201 when payload is valid with location null', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: buildPayload({ location: null }),
      requestId: 'req-success-null-location',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(201);
    if (result.statusCode !== 201) {
      throw new Error('Expected 201 response');
    }

    expect(result.body.data.location).toBeNull();
    expect(createAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        location: null,
      })
    );
  });

  it('201 when payload is valid with location omitted', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));
    const payload = buildPayload();
    delete payload.location;

    const result = await processCreateAlertRequest({
      payload,
      requestId: 'req-success-omitted-location',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(201);
    if (result.statusCode !== 201) {
      throw new Error('Expected 201 response');
    }

    expect(result.body.data.location).toBeNull();
  });

  it('400 when status is not TRIGGERED', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: buildPayload({ status: 'DISPATCHED' }),
      requestId: 'req-invalid-status',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error('Expected 400 response');
    }

    expect(result.body.error.code).toBe('VALIDATION_ERROR');
    expect(result.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'status',
          code: 'INVALID_ENUM',
        }),
      ])
    );
    expect(createAlert).not.toHaveBeenCalled();
  });

  it('400 when required fields are missing', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: {
        status: 'TRIGGERED',
      },
      requestId: 'req-missing-fields',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error('Expected 400 response');
    }

    expect(result.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'deviceId', code: 'REQUIRED_FIELD' }),
        expect.objectContaining({ field: 'triggeredAt', code: 'REQUIRED_FIELD' }),
      ])
    );
  });

  it('400 when unknown extra fields are present', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: buildPayload({ unexpectedField: 'oops' }),
      requestId: 'req-unknown-field',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error('Expected 400 response');
    }

    expect(result.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'unexpectedField',
          code: 'UNKNOWN_FIELD',
        }),
      ])
    );
  });

  it('400 when latitude is out of range', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: buildPayload({
        location: buildLocation({
          latitude: 123,
        }),
      }),
      requestId: 'req-invalid-latitude',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error('Expected 400 response');
    }

    expect(result.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'location.latitude',
          code: 'OUT_OF_RANGE',
        }),
      ])
    );
  });

  it('400 when breadcrumb trail exceeds max length', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const breadcrumbTrail = Array.from({ length: 11 }).map((_, index) => ({
      latitude: 28.6 + index * 0.0001,
      longitude: 77.2 + index * 0.0001,
      timestamp: VALID_TRIGGERED_AT - index,
    }));

    const result = await processCreateAlertRequest({
      payload: buildPayload({
        location: buildLocation({ breadcrumbTrail }),
      }),
      requestId: 'req-breadcrumb-too-long',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error('Expected 400 response');
    }

    expect(result.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'location.breadcrumbTrail',
          code: 'ARRAY_TOO_LONG',
        }),
      ])
    );
  });

  it('400 when triggeredAt is older than 24 hours', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: buildPayload({
        triggeredAt: FIXED_NOW_MS - 24 * 60 * 60 * 1000 - 1,
      }),
      requestId: 'req-too-old-triggered-at',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error('Expected 400 response');
    }

    expect(result.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'triggeredAt',
          code: 'TIME_OUT_OF_RANGE',
        }),
      ])
    );
  });

  it('400 when triggeredAt is more than 5 minutes in the future', async () => {
    const createAlert = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));

    const result = await processCreateAlertRequest({
      payload: buildPayload({
        triggeredAt: FIXED_NOW_MS + 5 * 60 * 1000 + 1,
      }),
      requestId: 'req-future-triggered-at',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error('Expected 400 response');
    }

    expect(result.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'triggeredAt',
          code: 'TIME_OUT_OF_RANGE',
        }),
      ])
    );
  });

  it('500 when persistence throws unexpectedly', async () => {
    const createAlert = vi.fn(async () => {
      throw new Error('db failure');
    });

    const result = await processCreateAlertRequest({
      payload: buildPayload(),
      requestId: 'req-internal-error',
      nowMs: () => FIXED_NOW_MS,
      createAlert,
    });

    expect(result.statusCode).toBe(500);
    if (result.statusCode !== 500) {
      throw new Error('Expected 500 response');
    }

    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body.error.message).toBe('Failed to persist alert');
  });

  it('includes requestId for success, validation error, and server error responses', async () => {
    const createAlertSuccess = vi.fn(async (input: CreateAlertPersistenceInput) => buildAlertRecord(input));
    const success = await processCreateAlertRequest({
      payload: buildPayload(),
      requestId: 'req-success-id',
      nowMs: () => FIXED_NOW_MS,
      createAlert: createAlertSuccess,
    });

    const validation = await processCreateAlertRequest({
      payload: { status: 'TRIGGERED' },
      requestId: 'req-validation-id',
      nowMs: () => FIXED_NOW_MS,
      createAlert: createAlertSuccess,
    });

    const createAlertFailure = vi.fn(async () => {
      throw new Error('db failure');
    });
    const serverError = await processCreateAlertRequest({
      payload: buildPayload(),
      requestId: 'req-server-error-id',
      nowMs: () => FIXED_NOW_MS,
      createAlert: createAlertFailure,
    });

    expect(success.body.requestId).toBe('req-success-id');
    expect(validation.body.requestId).toBe('req-validation-id');
    expect(serverError.body.requestId).toBe('req-server-error-id');
  });

  it('registers POST /api/v1/alerts route', () => {
    const router = createAlertsRouter({
      nowMs: () => FIXED_NOW_MS,
      createAlert: async (input: CreateAlertPersistenceInput) => buildAlertRecord(input),
    });

    const routes = (
      (router as unknown as {
        stack?: Array<{ route?: { path?: string; methods?: Record<string, boolean> } }>;
      }).stack ?? []
    )
      .map((layer) => layer.route)
      .filter((route): route is { path?: string; methods?: Record<string, boolean> } => Boolean(route));

    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/api/v1/alerts',
          methods: expect.objectContaining({ post: true }),
        }),
      ])
    );
  });
});
