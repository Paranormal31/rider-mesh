import type { NetworkMeshStatus } from '../networkMeshService';

export type MeshLocationPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type MeshAlertLocation = MeshLocationPoint & {
  breadcrumbTrail: MeshLocationPoint[];
};

export type NearbyAlertEvent = {
  alertId: string;
  victimDeviceId: string;
  victimName?: string | null;
  triggeredAt: number;
  location: MeshAlertLocation | null;
  distanceMeters: number;
};

export type AlertAssignedEvent = {
  alertId: string;
  victimDeviceId: string;
  responderDeviceId: string;
  responderName?: string | null;
  assignedAt: number;
};

export type AlertCancelledEvent = {
  alertId: string;
  cancelledAt: number;
};

export type AlertTransportAvailability = {
  canPublish: boolean;
  canReceive: boolean;
};

export type SOSTriggeredPayload = {
  alertId: string;
  victimDeviceId: string;
  victimName: string | null;
  triggeredAt: number;
  location: MeshAlertLocation | null;
  maxHops: number;
};

export type SOSCancelledPayload = {
  alertId: string;
  cancelledAt: number;
};

export type SOSAssignedPayload = {
  alertId: string;
  victimDeviceId: string;
  responderDeviceId: string;
  responderName: string | null;
  assignedAt: number;
};

export type AlertTransportEventMap = {
  nearby_alert: NearbyAlertEvent;
  assigned: AlertAssignedEvent;
  cancelled: AlertCancelledEvent;
};

export type AlertTransportListener<TEvent extends keyof AlertTransportEventMap> = (
  payload: AlertTransportEventMap[TEvent]
) => void;

export type PublishResult = {
  ok: boolean;
  reason?: string;
};

export type PublishTriggerResult = PublishResult & {
  alertId: string;
};

export interface AlertTransport {
  readonly id: 'internet' | 'bluetooth';
  start(): Promise<void>;
  stop(): void;
  getAvailability(): AlertTransportAvailability;
  publishSosTriggered(payload: SOSTriggeredPayload): Promise<PublishTriggerResult>;
  publishSosCancelled(payload: SOSCancelledPayload): Promise<PublishResult>;
  publishSosAssigned(payload: SOSAssignedPayload): Promise<PublishResult>;
  on<TEvent extends keyof AlertTransportEventMap>(
    event: TEvent,
    listener: AlertTransportListener<TEvent>
  ): () => void;
}

export type MeshMode = 'AUTO' | 'FORCE_MESH' | 'FORCE_INTERNET';

export type TransportStatusSnapshot = {
  meshMode: MeshMode;
  bluetooth: AlertTransportAvailability;
  internet: AlertTransportAvailability;
  networkStatus: NetworkMeshStatus;
};
