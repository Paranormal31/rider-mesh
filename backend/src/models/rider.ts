import mongoose, { Schema, type InferSchemaType } from 'mongoose';

import type { RiderPresenceRecord } from '../types/rider';

const riderSchema = new Schema(
  {
    deviceId: { type: String, required: true, trim: true, unique: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    lastSeenAt: { type: Number, required: true, index: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  {
    collection: 'riders',
    versionKey: false,
    strict: 'throw',
  }
);

type RiderDocument = InferSchemaType<typeof riderSchema> & {
  _id: mongoose.Types.ObjectId;
};

const RiderModel =
  (mongoose.models.Rider as mongoose.Model<RiderDocument> | undefined) ??
  mongoose.model<RiderDocument>('Rider', riderSchema);

function mapRiderDocument(document: RiderDocument): RiderPresenceRecord {
  return {
    id: document._id.toString(),
    deviceId: document.deviceId,
    latitude: document.latitude,
    longitude: document.longitude,
    timestamp: document.timestamp,
    lastSeenAt: document.lastSeenAt,
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
  };
}

export async function upsertRiderHeartbeat(input: {
  deviceId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}): Promise<RiderPresenceRecord> {
  const now = Date.now();
  const record = await RiderModel.findOneAndUpdate(
    { deviceId: input.deviceId },
    {
      $set: {
        latitude: input.latitude,
        longitude: input.longitude,
        timestamp: input.timestamp,
        lastSeenAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true, new: true }
  ).lean<RiderDocument>();

  return mapRiderDocument(record);
}

export async function listActiveRiders(sinceMs: number): Promise<RiderPresenceRecord[]> {
  const records = await RiderModel.find({ lastSeenAt: { $gte: sinceMs } }).lean<RiderDocument[]>();
  return records.map((record) => mapRiderDocument(record));
}
