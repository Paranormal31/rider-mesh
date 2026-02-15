import mongoose, { Schema, type InferSchemaType } from 'mongoose';

import type { CreateHazardInput, HazardRecord, HazardType } from '../types/hazard';
import { HAZARD_TYPES } from '../types/hazard';

const hazardSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: HAZARD_TYPES,
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
  },
  {
    collection: 'hazards',
    versionKey: false,
    strict: 'throw',
  }
);

type HazardDocument = InferSchemaType<typeof hazardSchema> & {
  _id: mongoose.Types.ObjectId;
  type: HazardType;
};

const HazardModel =
  (mongoose.models.Hazard as mongoose.Model<HazardDocument> | undefined) ??
  mongoose.model<HazardDocument>('Hazard', hazardSchema);

function mapHazardDocument(document: HazardDocument): HazardRecord {
  return {
    id: document._id.toString(),
    type: document.type,
    latitude: document.latitude,
    longitude: document.longitude,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function listHazardRecords(): Promise<HazardRecord[]> {
  const docs = await HazardModel.find().sort({ createdAt: -1 }).lean<HazardDocument[]>();
  return docs.map(mapHazardDocument);
}

export async function createHazardRecord(input: CreateHazardInput): Promise<HazardRecord> {
  const now = Date.now();
  const doc = await HazardModel.create({
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  return mapHazardDocument(doc.toObject() as HazardDocument);
}

export async function removeHazardRecord(hazardId: string): Promise<{ removed: boolean }> {
  if (!mongoose.isValidObjectId(hazardId)) {
    return { removed: false };
  }
  const result = await HazardModel.deleteOne({ _id: hazardId });
  return { removed: result.deletedCount > 0 };
}

