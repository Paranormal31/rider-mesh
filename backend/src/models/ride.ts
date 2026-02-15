import mongoose, { Schema, type InferSchemaType } from 'mongoose';

import type { EndRideInput, RideRecord, RideStatus, StartRideInput } from '../types/ride';
import { RIDE_STATUSES } from '../types/ride';

const rideSchema = new Schema(
  {
    deviceId: { type: String, required: true, trim: true, index: true },
    sessionId: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: RIDE_STATUSES },
    startedAt: { type: Number, required: true },
    endedAt: { type: Number, required: false, default: null },
    durationMs: { type: Number, required: false, default: null },
    distanceKm: { type: Number, required: true, default: 0 },
    fatigueWarnings: { type: Number, required: true, default: 0 },
    hazardsReported: { type: Number, required: true, default: 0 },
    sosTriggered: { type: Number, required: true, default: 0 },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  {
    collection: 'rides',
    versionKey: false,
    strict: 'throw',
  }
);

type RideDocument = InferSchemaType<typeof rideSchema> & {
  _id: mongoose.Types.ObjectId;
  status: RideStatus;
};

const RideModel =
  (mongoose.models.Ride as mongoose.Model<RideDocument> | undefined) ??
  mongoose.model<RideDocument>('Ride', rideSchema);

function mapRideDocument(document: RideDocument): RideRecord {
  return {
    id: document._id.toString(),
    deviceId: document.deviceId,
    sessionId: document.sessionId,
    status: document.status,
    startedAt: document.startedAt,
    endedAt: document.endedAt ?? null,
    durationMs: document.durationMs ?? null,
    distanceKm: document.distanceKm,
    fatigueWarnings: document.fatigueWarnings,
    hazardsReported: document.hazardsReported,
    sosTriggered: document.sosTriggered,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function startRideRecord(input: StartRideInput): Promise<RideRecord> {
  const now = Date.now();
  const doc = await RideModel.create({
    deviceId: input.deviceId,
    sessionId: input.sessionId,
    status: 'ACTIVE',
    startedAt: input.startedAt,
    endedAt: null,
    durationMs: null,
    distanceKm: 0,
    fatigueWarnings: 0,
    hazardsReported: 0,
    sosTriggered: 0,
    createdAt: now,
    updatedAt: now,
  });
  return mapRideDocument(doc.toObject() as RideDocument);
}

export async function endRideRecord(input: EndRideInput): Promise<RideRecord | null> {
  if (!mongoose.isValidObjectId(input.rideId)) {
    return null;
  }

  const existing = await RideModel.findById(input.rideId).lean<RideDocument | null>();
  if (!existing || existing.status !== 'ACTIVE') {
    return null;
  }

  const durationMs = Math.max(0, input.endedAt - existing.startedAt);
  const updatedAt = Date.now();

  const updated = await RideModel.findOneAndUpdate(
    { _id: input.rideId, status: 'ACTIVE' },
    {
      $set: {
        status: 'ENDED',
        endedAt: input.endedAt,
        durationMs,
        distanceKm: input.distanceKm,
        fatigueWarnings: input.fatigueWarnings,
        hazardsReported: input.hazardsReported,
        sosTriggered: input.sosTriggered,
        updatedAt,
      },
    },
    { new: true }
  ).lean<RideDocument | null>();

  if (!updated) {
    return null;
  }

  return mapRideDocument(updated);
}

export async function listRideRecordsForDevice(deviceId: string): Promise<RideRecord[]> {
  const docs = await RideModel.find({ deviceId: deviceId.trim(), status: 'ENDED' })
    .sort({ endedAt: -1, updatedAt: -1 })
    .lean<RideDocument[]>();
  return docs.map(mapRideDocument);
}
