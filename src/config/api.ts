export const BASE_URL = 'http://10.10.137.67:4000';

export const ALERTS_API_URL = `${BASE_URL}/api/v1/alerts`;
export const SOCKET_BASE_URL = BASE_URL;
export const RIDER_HEARTBEAT_API_URL = `${BASE_URL}/api/v1/riders/heartbeat`;
export const HAZARDS_API_URL = `${BASE_URL}/api/v1/hazards`;
export const RIDES_API_URL = `${BASE_URL}/api/v1/rides`;
export const RIDES_START_API_URL = `${RIDES_API_URL}/start`;

export function alertAcceptApiUrl(alertId: string): string {
  return `${ALERTS_API_URL}/${alertId}/accept`;
}

export function buildAlertStatusApiUrl(alertId: string): string {
  return `${ALERTS_API_URL}/${alertId}/status`;
}

export function rideEndApiUrl(rideId: string): string {
  return `${RIDES_API_URL}/${rideId}/end`;
}

export function ridesByDeviceApiUrl(deviceId: string): string {
  return `${RIDES_API_URL}?deviceId=${encodeURIComponent(deviceId)}`;
}
