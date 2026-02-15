import { randomUUID } from 'node:crypto';

import { type RequestHandler, type Response, Router } from 'express';

import type {
  AlertBreadcrumbPoint,
  AlertLocation,
  AlertRecord,
  CreateAlertPersistenceInput,
  CreateAlertSuccessResponse,
  InternalErrorResponse,
  ValidationErrorResponse,
  ValidationIssue,
  ValidationIssueCode,
} from '../types/alert';
import { ALERT_STATUSES } from '../types/alert';

const MAX_PAST_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_BREADCRUMB_POINTS = 10;

const TOP_LEVEL_ALLOWED_FIELDS = new Set(['deviceId', 'status', 'triggeredAt', 'location']);
const LOCATION_ALLOWED_FIELDS = new Set(['latitude', 'longitude', 'timestamp', 'breadcrumbTrail']);
const POINT_ALLOWED_FIELDS = new Set(['latitude', 'longitude', 'timestamp']);

type ValidationResult =
  | { ok: true; value: CreateAlertPersistenceInput }
  | { ok: false; details: ValidationIssue[] };

type CreateAlertResult =
  | { statusCode: 201; body: CreateAlertSuccessResponse }
  | { statusCode: 400; body: ValidationErrorResponse }
  | { statusCode: 500; body: InternalErrorResponse };

export interface CreateAlertsRouteDeps {
  nowMs: () => number;
  createAlert: (input: CreateAlertPersistenceInput) => Promise<AlertRecord>;
}

interface ProcessCreateAlertDeps extends CreateAlertsRouteDeps {
  payload: unknown;
  requestId: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function pushIssue(
  details: ValidationIssue[],
  field: string,
  code: ValidationIssueCode,
  message: string
): void {
  details.push({ field, code, message });
}

function pushUnknownFieldIssues(
  details: ValidationIssue[],
  value: Record<string, unknown>,
  allowedFields: Set<string>,
  pathPrefix = ''
): void {
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      const field = pathPrefix ? `${pathPrefix}.${key}` : key;
      pushIssue(details, field, 'UNKNOWN_FIELD', `Unknown field: ${field}`);
    }
  }
}

function validatePoint(
  value: Record<string, unknown>,
  pathPrefix: string,
  details: ValidationIssue[],
  allowedFields: Set<string> = POINT_ALLOWED_FIELDS
): AlertBreadcrumbPoint | null {
  pushUnknownFieldIssues(details, value, allowedFields, pathPrefix);

  const latitudeValue = value.latitude;
  const longitudeValue = value.longitude;
  const timestampValue = value.timestamp;

  if (!Object.prototype.hasOwnProperty.call(value, 'latitude')) {
    pushIssue(details, `${pathPrefix}.latitude`, 'REQUIRED_FIELD', 'latitude is required');
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'longitude')) {
    pushIssue(details, `${pathPrefix}.longitude`, 'REQUIRED_FIELD', 'longitude is required');
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'timestamp')) {
    pushIssue(details, `${pathPrefix}.timestamp`, 'REQUIRED_FIELD', 'timestamp is required');
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  let timestamp: number | null = null;

  if (Object.prototype.hasOwnProperty.call(value, 'latitude')) {
    if (typeof latitudeValue !== 'number' || Number.isNaN(latitudeValue)) {
      pushIssue(details, `${pathPrefix}.latitude`, 'INVALID_TYPE', 'latitude must be a number');
    } else if (latitudeValue < -90 || latitudeValue > 90) {
      pushIssue(
        details,
        `${pathPrefix}.latitude`,
        'OUT_OF_RANGE',
        'latitude must be between -90 and 90'
      );
    } else {
      latitude = latitudeValue;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, 'longitude')) {
    if (typeof longitudeValue !== 'number' || Number.isNaN(longitudeValue)) {
      pushIssue(details, `${pathPrefix}.longitude`, 'INVALID_TYPE', 'longitude must be a number');
    } else if (longitudeValue < -180 || longitudeValue > 180) {
      pushIssue(
        details,
        `${pathPrefix}.longitude`,
        'OUT_OF_RANGE',
        'longitude must be between -180 and 180'
      );
    } else {
      longitude = longitudeValue;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, 'timestamp')) {
    if (!isFiniteInteger(timestampValue)) {
      pushIssue(
        details,
        `${pathPrefix}.timestamp`,
        'INVALID_TYPE',
        'timestamp must be a Unix epoch milliseconds integer'
      );
    } else if (timestampValue < 0) {
      pushIssue(
        details,
        `${pathPrefix}.timestamp`,
        'OUT_OF_RANGE',
        'timestamp must be greater than or equal to 0'
      );
    } else {
      timestamp = timestampValue;
    }
  }

  if (latitude === null || longitude === null || timestamp === null) {
    return null;
  }

  return {
    latitude,
    longitude,
    timestamp,
  };
}

export function validateCreateAlertPayload(payload: unknown, nowMs: number): ValidationResult {
  const details: ValidationIssue[] = [];

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      details: [
        {
          field: 'body',
          code: 'INVALID_TYPE',
          message: 'Request body must be a JSON object',
        },
      ],
    };
  }

  pushUnknownFieldIssues(details, payload, TOP_LEVEL_ALLOWED_FIELDS);

  const hasDeviceId = Object.prototype.hasOwnProperty.call(payload, 'deviceId');
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, 'status');
  const hasTriggeredAt = Object.prototype.hasOwnProperty.call(payload, 'triggeredAt');
  const hasLocation = Object.prototype.hasOwnProperty.call(payload, 'location');

  if (!hasDeviceId) {
    pushIssue(details, 'deviceId', 'REQUIRED_FIELD', 'deviceId is required');
  }
  if (!hasStatus) {
    pushIssue(details, 'status', 'REQUIRED_FIELD', 'status is required');
  }
  if (!hasTriggeredAt) {
    pushIssue(details, 'triggeredAt', 'REQUIRED_FIELD', 'triggeredAt is required');
  }

  let deviceId = '';
  if (hasDeviceId) {
    if (typeof payload.deviceId !== 'string') {
      pushIssue(details, 'deviceId', 'INVALID_TYPE', 'deviceId must be a string');
    } else {
      const trimmed = payload.deviceId.trim();
      if (!trimmed) {
        pushIssue(details, 'deviceId', 'INVALID_VALUE', 'deviceId must be a non-empty string');
      } else {
        deviceId = trimmed;
      }
    }
  }

  let status: CreateAlertPersistenceInput['status'] = 'TRIGGERED';
  if (hasStatus) {
    if (typeof payload.status !== 'string') {
      pushIssue(details, 'status', 'INVALID_TYPE', 'status must be a string');
    } else if (!ALERT_STATUSES.includes(payload.status as (typeof ALERT_STATUSES)[number])) {
      pushIssue(details, 'status', 'INVALID_ENUM', `status must be one of: ${ALERT_STATUSES.join(', ')}`);
    } else if (payload.status !== 'TRIGGERED') {
      pushIssue(details, 'status', 'INVALID_ENUM', 'status must be TRIGGERED for create');
    } else {
      status = payload.status;
    }
  }

  let triggeredAt = 0;
  if (hasTriggeredAt) {
    if (!isFiniteInteger(payload.triggeredAt)) {
      pushIssue(
        details,
        'triggeredAt',
        'INVALID_TYPE',
        'triggeredAt must be a Unix epoch milliseconds integer'
      );
    } else {
      const oldestAllowed = nowMs - MAX_PAST_WINDOW_MS;
      const newestAllowed = nowMs + MAX_FUTURE_SKEW_MS;

      if (payload.triggeredAt < oldestAllowed) {
        pushIssue(
          details,
          'triggeredAt',
          'TIME_OUT_OF_RANGE',
          'triggeredAt must be within the last 24 hours'
        );
      } else if (payload.triggeredAt > newestAllowed) {
        pushIssue(
          details,
          'triggeredAt',
          'TIME_OUT_OF_RANGE',
          'triggeredAt cannot be more than 5 minutes in the future'
        );
      } else {
        triggeredAt = payload.triggeredAt;
      }
    }
  }

  let location: AlertLocation | null = null;

  if (hasLocation) {
    if (payload.location === null) {
      location = null;
    } else if (!isPlainObject(payload.location)) {
      pushIssue(details, 'location', 'INVALID_TYPE', 'location must be an object or null');
    } else {
      const locationPayload = payload.location;
      pushUnknownFieldIssues(details, locationPayload, LOCATION_ALLOWED_FIELDS, 'location');

      const point = validatePoint(locationPayload, 'location', details, LOCATION_ALLOWED_FIELDS);

      if (!Object.prototype.hasOwnProperty.call(locationPayload, 'breadcrumbTrail')) {
        pushIssue(
          details,
          'location.breadcrumbTrail',
          'REQUIRED_FIELD',
          'breadcrumbTrail is required when location is provided'
        );
      }

      let breadcrumbTrail: AlertBreadcrumbPoint[] | null = null;

      if (Object.prototype.hasOwnProperty.call(locationPayload, 'breadcrumbTrail')) {
        if (!Array.isArray(locationPayload.breadcrumbTrail)) {
          pushIssue(
            details,
            'location.breadcrumbTrail',
            'INVALID_TYPE',
            'breadcrumbTrail must be an array'
          );
        } else {
          if (locationPayload.breadcrumbTrail.length > MAX_BREADCRUMB_POINTS) {
            pushIssue(
              details,
              'location.breadcrumbTrail',
              'ARRAY_TOO_LONG',
              `breadcrumbTrail cannot exceed ${MAX_BREADCRUMB_POINTS} items`
            );
          }

          const normalizedTrail: AlertBreadcrumbPoint[] = [];
          locationPayload.breadcrumbTrail.forEach((item, index) => {
            const itemPath = `location.breadcrumbTrail[${index}]`;
            if (!isPlainObject(item)) {
              pushIssue(details, itemPath, 'INVALID_TYPE', 'breadcrumb item must be an object');
              return;
            }

            const normalized = validatePoint(item, itemPath, details);
            if (normalized) {
              normalizedTrail.push(normalized);
            }
          });

          breadcrumbTrail = normalizedTrail;
        }
      }

      if (point && breadcrumbTrail) {
        location = {
          ...point,
          breadcrumbTrail,
        };
      }
    }
  }

  if (details.length > 0) {
    return {
      ok: false,
      details,
    };
  }

  return {
    ok: true,
    value: {
      deviceId,
      status,
      triggeredAt,
      location,
    },
  };
}

export async function processCreateAlertRequest({
  payload,
  requestId,
  nowMs,
  createAlert,
}: ProcessCreateAlertDeps): Promise<CreateAlertResult> {
  const validation = validateCreateAlertPayload(payload, nowMs());

  if (!validation.ok) {
    return {
      statusCode: 400,
      body: {
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: validation.details,
        },
      },
    };
  }

  try {
    const record = await createAlert(validation.value);
    return {
      statusCode: 201,
      body: {
        requestId,
        data: record,
      },
    };
  } catch {
    return {
      statusCode: 500,
      body: {
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to persist alert',
        },
      },
    };
  }
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

export function createAlertsRouter({ nowMs, createAlert }: CreateAlertsRouteDeps): Router {
  const router = Router();

  const handler: RequestHandler = async (request, response) => {
    const requestId = resolveRequestId(response);
    const result = await processCreateAlertRequest({
      payload: request.body,
      requestId,
      nowMs,
      createAlert,
    });

    response.status(result.statusCode).json(result.body);
  };

  router.post('/api/v1/alerts', handler);

  return router;
}
