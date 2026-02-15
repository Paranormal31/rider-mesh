export const ALERT_STATUSES = [
  'TRIGGERED',
  'ESCALATED',
  'DISPATCHING',
  'DISPATCHED',
  'RESPONDER_ASSIGNED',
  'RESOLVED',
  'CANCELLED',
] as const;

export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface AlertBreadcrumbPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface AlertLocation extends AlertBreadcrumbPoint {
  breadcrumbTrail: AlertBreadcrumbPoint[];
}

export interface CreateAlertRequest {
  deviceId: string;
  status: AlertStatus;
  triggeredAt: number;
  location?: AlertLocation | null;
}

export interface CreateAlertPersistenceInput {
  deviceId: string;
  status: AlertStatus;
  triggeredAt: number;
  location: AlertLocation | null;
}

export interface AlertRecord {
  id: string;
  deviceId: string;
  status: AlertStatus;
  triggeredAt: number;
  location: AlertLocation | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAlertSuccessResponse {
  requestId: string;
  data: AlertRecord;
}

export interface UpdateAlertStatusRequest {
  status: AlertStatus;
}

export interface UpdateAlertStatusResponse {
  requestId: string;
  data: Pick<AlertRecord, 'id' | 'status' | 'updatedAt'>;
}

export type ValidationIssueCode =
  | 'REQUIRED_FIELD'
  | 'INVALID_TYPE'
  | 'INVALID_VALUE'
  | 'INVALID_ENUM'
  | 'UNKNOWN_FIELD'
  | 'OUT_OF_RANGE'
  | 'ARRAY_TOO_LONG'
  | 'TIME_OUT_OF_RANGE';

export interface ValidationIssue {
  field: string;
  code: ValidationIssueCode;
  message: string;
}

export interface ValidationErrorResponse {
  requestId: string;
  error: {
    code: 'VALIDATION_ERROR';
    message: 'Request validation failed';
    details: ValidationIssue[];
  };
}

export interface InternalErrorResponse {
  requestId: string;
  error: {
    code: 'INTERNAL_ERROR';
    message: 'Failed to persist alert';
  };
}

export interface AlertNotFoundResponse {
  requestId: string;
  error: {
    code: 'ALERT_NOT_FOUND';
    message: 'Alert not found';
  };
}
