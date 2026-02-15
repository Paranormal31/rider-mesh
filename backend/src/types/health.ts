export type DbReadyStateName =
  | 'disconnected'
  | 'connected'
  | 'connecting'
  | 'disconnecting'
  | 'uninitialized';

export interface DatabaseHealth {
  connected: boolean;
  readyStateCode: number;
  readyState: DbReadyStateName;
  dbName?: string;
  host?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'alert-api-sms-backend';
  timestamp: string;
  uptimeSec: number;
  database: DatabaseHealth;
}
