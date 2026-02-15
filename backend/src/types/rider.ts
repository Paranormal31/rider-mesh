export interface RiderLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface RiderHeartbeatRequest {
  deviceId: string;
  location: RiderLocation;
}

export interface RiderPresenceRecord {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  lastSeenAt: number;
  updatedAt: number;
  createdAt: number;
}

export interface RiderHeartbeatResponse {
  requestId: string;
  data: {
    deviceId: string;
    receivedAt: number;
  };
}
