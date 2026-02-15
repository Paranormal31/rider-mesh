import type { AlertRecord } from '../types/alert';
import type { RiderPresenceRecord } from '../types/rider';

const EARTH_RADIUS_METERS = 6_371_000;

export interface NearbyRiderMatch {
  deviceId: string;
  distanceMeters: number;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function findNearbyRidersForAlert(params: {
  alert: AlertRecord;
  riders: RiderPresenceRecord[];
  radiusMeters: number;
}): NearbyRiderMatch[] {
  const { alert, riders, radiusMeters } = params;
  if (!alert.location) {
    return [];
  }

  return riders
    .filter((rider) => rider.deviceId !== alert.deviceId)
    .map((rider) => ({
      deviceId: rider.deviceId,
      distanceMeters: haversineMeters(alert.location!, {
        latitude: rider.latitude,
        longitude: rider.longitude,
      }),
    }))
    .filter((match) => match.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
