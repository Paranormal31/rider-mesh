import mongoose, { Schema, type InferSchemaType } from 'mongoose';

import type { AlertRecord, AlertStatus, CreateAlertPersistenceInput } from '../types/alert';
import { ALERT_STATUSES } from '../types/alert';

const breadcrumbPointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Number, required: true },
  },
  {
    _id: false,
    strict: 'throw',
  }
);

const alertLocationSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    breadcrumbTrail: {
      type: [breadcrumbPointSchema],
      required: true,
      default: [],
    },
  },
  {
    _id: false,
    strict: 'throw',
  }
);

const alertSchema = new Schema(
  {
    deviceId: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ALERT_STATUSES,
    },
    triggeredAt: { type: Number, required: true },
    location: {
      type: alertLocationSchema,
      required: false,
      default: null,
    },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  {
    collection: 'alerts',
    versionKey: false,
    strict: 'throw',
  }
);

type AlertDocument = InferSchemaType<typeof alertSchema> & {
  _id: mongoose.Types.ObjectId;
  status: AlertStatus;
};

export type AlertStatusTransitionResult =
  | { kind: 'updated'; data: Pick<AlertRecord, 'id' | 'status' | 'updatedAt'> }
  | { kind: 'not_found' }
  | { kind: 'blocked'; currentStatus: AlertStatus };

const AlertModel =
  (mongoose.models.Alert as mongoose.Model<AlertDocument> | undefined) ??
  mongoose.model<AlertDocument>('Alert', alertSchema);

function mapAlertDocument(document: AlertDocument): AlertRecord {
  return {
    id: document._id.toString(),
    deviceId: document.deviceId,
    status: document.status,
    triggeredAt: document.triggeredAt,
    location: document.location
      ? {
          latitude: document.location.latitude,
          longitude: document.location.longitude,
          timestamp: document.location.timestamp,
          breadcrumbTrail: document.location.breadcrumbTrail.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            timestamp: point.timestamp,
          })),
        }
      : null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createAlertRecord(input: CreateAlertPersistenceInput): Promise<AlertRecord> {
  const nowMs = Date.now();

  const document = await AlertModel.create({
    ...input,
    location: input.location,
    createdAt: nowMs,
    updatedAt: nowMs,
  });

  return mapAlertDocument(document.toObject() as AlertDocument);
}

export async function transitionAlertStatusById(
  id: string,
  status: 'CANCELLED' | 'ESCALATED'
): Promise<AlertStatusTransitionResult> {
  const nowMs = Date.now();
  const updated = await AlertModel.findOneAndUpdate(
    { _id: id, status: 'TRIGGERED' },
    {
      $set: {
        status,
        updatedAt: nowMs,
      },
    },
    {
      new: true,
      projection: {
        _id: 1,
        status: 1,
        updatedAt: 1,
      },
    }
  ).lean<{ _id: mongoose.Types.ObjectId; status: AlertStatus; updatedAt: number } | null>();

  if (updated) {
    return {
      kind: 'updated',
      data: {
        id: updated._id.toString(),
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    };
  }

  const existing = await AlertModel.findById(id, { status: 1 }).lean<{ status: AlertStatus } | null>();
  if (!existing) {
    return { kind: 'not_found' };
  }

  return {
    kind: 'blocked',
    currentStatus: existing.status,
  };
}
