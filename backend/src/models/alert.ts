import mongoose, { Schema, type InferSchemaType } from 'mongoose';

import type {
  AcceptAlertFailureCode,
  AlertRecord,
  AlertStatus,
  CreateAlertPersistenceInput,
} from '../types/alert';
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
    responderDeviceId: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    assignedAt: {
      type: Number,
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
    responderDeviceId: document.responderDeviceId ?? null,
    assignedAt: document.assignedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createAlertRecord(input: CreateAlertPersistenceInput): Promise<AlertRecord> {
  const nowMs = Date.now();

  const document = await AlertModel.create({
    ...input,
    location: input.location,
    responderDeviceId: null,
    assignedAt: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  });

  return mapAlertDocument(document.toObject() as AlertDocument);
}

export type AcceptAlertRecordResult =
  | { ok: true; record: AlertRecord }
  | { ok: false; code: AcceptAlertFailureCode; record: AlertRecord | null };

const CLAIMABLE_STATUSES: AlertStatus[] = ['TRIGGERED', 'DISPATCHING', 'DISPATCHED'];

export async function acceptAlertRecord(input: {
  alertId: string;
  responderDeviceId: string;
  assignedAt: number;
}): Promise<AcceptAlertRecordResult> {
  if (!mongoose.isValidObjectId(input.alertId)) {
    return {
      ok: false,
      code: 'ALERT_NOT_FOUND',
      record: null,
    };
  }

  const updated = await AlertModel.findOneAndUpdate(
    {
      _id: input.alertId,
      status: { $in: CLAIMABLE_STATUSES },
      responderDeviceId: null,
    },
    {
      $set: {
        responderDeviceId: input.responderDeviceId,
        assignedAt: input.assignedAt,
        status: 'RESPONDER_ASSIGNED',
        updatedAt: Date.now(),
      },
    },
    { new: true }
  ).lean<AlertDocument | null>();

  if (updated) {
    return {
      ok: true,
      record: mapAlertDocument(updated),
    };
  }

  const existing = await AlertModel.findById(input.alertId).lean<AlertDocument | null>();
  if (!existing) {
    return {
      ok: false,
      code: 'ALERT_NOT_FOUND',
      record: null,
    };
  }

  if (existing.responderDeviceId) {
    return {
      ok: false,
      code: 'ALERT_ALREADY_ASSIGNED',
      record: mapAlertDocument(existing),
    };
  }

  return {
    ok: false,
    code: 'ALERT_NOT_CLAIMABLE',
    record: mapAlertDocument(existing),
  };
}
