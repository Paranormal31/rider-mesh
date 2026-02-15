export const BASE_URL = 'http://10.10.137.64:4000';

export const ALERTS_API_URL = `${BASE_URL}/api/v1/alerts`;

export function buildAlertStatusApiUrl(alertId: string): string {
  return `${ALERTS_API_URL}/${alertId}`;
}
