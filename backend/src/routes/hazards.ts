import { randomUUID } from 'node:crypto';

import { type RequestHandler, type Response, Router } from 'express';

import type { CreateHazardInput, HazardRecord, HazardType } from '../types/hazard';
import { HAZARD_TYPES } from '../types/hazard';

type ValidationIssue = {
  field: string;
  message: string;
};

type ValidationErrorResponse = {
  requestId: string;
  error: {
    code: 'VALIDATION_ERROR';
    message: 'Request validation failed';
    details: ValidationIssue[];
  };
};

type InternalErrorResponse = {
  requestId: string;
  error: {
    code: 'INTERNAL_ERROR';
    message: string;
  };
};

export interface HazardsRouteDeps {
  listHazards: () => Promise<HazardRecord[]>;
  createHazard: (input: CreateHazardInput) => Promise<HazardRecord>;
  removeHazard: (hazardId: string) => Promise<{ removed: boolean }>;
  onHazardCreated?: (hazard: HazardRecord) => void | Promise<void>;
  onHazardRemoved?: (hazardId: string) => void | Promise<void>;
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

function validateCreateHazardPayload(payload: unknown): {
  ok: true;
  value: CreateHazardInput;
} | {
  ok: false;
  details: ValidationIssue[];
} {
  const details: ValidationIssue[] = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      details: [{ field: 'body', message: 'Request body must be an object.' }],
    };
  }

  const body = payload as Record<string, unknown>;
  if (typeof body.type !== 'string' || !HAZARD_TYPES.includes(body.type as HazardType)) {
    details.push({ field: 'type', message: `type must be one of: ${HAZARD_TYPES.join(', ')}` });
  }
  if (typeof body.latitude !== 'number' || Number.isNaN(body.latitude) || body.latitude < -90 || body.latitude > 90) {
    details.push({ field: 'latitude', message: 'latitude must be between -90 and 90.' });
  }
  if (
    typeof body.longitude !== 'number' ||
    Number.isNaN(body.longitude) ||
    body.longitude < -180 ||
    body.longitude > 180
  ) {
    details.push({ field: 'longitude', message: 'longitude must be between -180 and 180.' });
  }

  if (details.length > 0) {
    return { ok: false, details };
  }

  return {
    ok: true,
    value: {
      type: body.type as HazardType,
      latitude: body.latitude as number,
      longitude: body.longitude as number,
    },
  };
}

export function createHazardsRouter({
  listHazards,
  createHazard,
  removeHazard,
  onHazardCreated,
  onHazardRemoved,
}: HazardsRouteDeps): Router {
  const router = Router();

  const listHandler: RequestHandler = async (_request, response) => {
    const requestId = resolveRequestId(response);
    try {
      const hazards = await listHazards();
      response.status(200).json({ requestId, data: hazards });
    } catch {
      const body: InternalErrorResponse = {
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list hazards.',
        },
      };
      response.status(500).json(body);
    }
  };

  const createHandler: RequestHandler = async (request, response) => {
    const requestId = resolveRequestId(response);
    const validation = validateCreateHazardPayload(request.body);
    if (!validation.ok) {
      const body: ValidationErrorResponse = {
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: validation.details,
        },
      };
      response.status(400).json(body);
      return;
    }

    try {
      const hazard = await createHazard(validation.value);
      if (onHazardCreated) {
        await onHazardCreated(hazard);
      }
      response.status(201).json({ requestId, data: hazard });
    } catch {
      const body: InternalErrorResponse = {
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create hazard.',
        },
      };
      response.status(500).json(body);
    }
  };

  const removeHandler: RequestHandler = async (request, response) => {
    const requestId = resolveRequestId(response);
    try {
      const result = await removeHazard(request.params.id);
      if (!result.removed) {
        response.status(404).json({
          requestId,
          error: {
            code: 'NOT_FOUND',
            message: 'Hazard not found.',
          },
        });
        return;
      }
      if (onHazardRemoved) {
        await onHazardRemoved(request.params.id);
      }
      response.status(200).json({ requestId, data: { id: request.params.id } });
    } catch {
      const body: InternalErrorResponse = {
        requestId,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to remove hazard.',
        },
      };
      response.status(500).json(body);
    }
  };

  router.get('/api/v1/hazards', listHandler);
  router.post('/api/v1/hazards', createHandler);
  router.delete('/api/v1/hazards/:id', removeHandler);
  return router;
}

