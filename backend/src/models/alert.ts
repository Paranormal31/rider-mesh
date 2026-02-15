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
