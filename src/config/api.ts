export const BASE_URL = 'http://10.10.137.64:4000';

export const ALERTS_API_URL = `${BASE_URL}/api/v1/alerts`;
export const SOCKET_BASE_URL = BASE_URL;
export const RIDER_HEARTBEAT_API_URL = `${BASE_URL}/api/v1/riders/heartbeat`;

export function alertAcceptApiUrl(alertId: string): string {
  return `${ALERTS_API_URL}/${alertId}/accept`;
}
