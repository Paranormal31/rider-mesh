export const RIDE_STATUSES = ['ACTIVE', 'ENDED'] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export interface RideRecord {
  id: string;
  deviceId: string;
  sessionId: string;
  status: RideStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  distanceKm: number;
  fatigueWarnings: number;
  hazardsReported: number;
  sosTriggered: number;
  createdAt: number;
  updatedAt: number;
}

export interface StartRideInput {
  deviceId: string;
  sessionId: string;
  startedAt: number;
}

export interface EndRideInput {
  rideId: string;
  endedAt: number;
  distanceKm: number;
  fatigueWarnings: number;
  hazardsReported: number;
  sosTriggered: number;
}
