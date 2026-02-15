export const HAZARD_TYPES = ['POTHOLE', 'CONSTRUCTION', 'WATERLOGGING', 'ACCIDENT_ZONE'] as const;

export type HazardType = (typeof HAZARD_TYPES)[number];

export interface HazardRecord {
  id: string;
  type: HazardType;
  latitude: number;
  longitude: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateHazardInput {
  type: HazardType;
  latitude: number;
  longitude: number;
}

