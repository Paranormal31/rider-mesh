import { io, type Socket } from 'socket.io-client';

import { SOCKET_BASE_URL } from '@/src/config/api';

import { deviceIdentityService } from './deviceIdentityService';
import type { EmergencyControllerLocationPayload } from './emergencyControllerService';

export type NearbyAlertEvent = {
  alertId: string;
  victimDeviceId: string;
  triggeredAt: number;
  location: EmergencyControllerLocationPayload | null;
  distanceMeters: number;
};

export type AlertAssignedEvent = {
  alertId: string;
  victimDeviceId: string;
  responderDeviceId: string;
  assignedAt: number;
};

type SocketEventMap = {
  'alert:new_nearby': NearbyAlertEvent;
  'alert:assigned': AlertAssignedEvent;
};

class SocketService {
  private socket: Socket | null = null;
  private started = false;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.socket = io(SOCKET_BASE_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      void this.registerDevice();
    });

    this.started = true;
    if (this.socket.connected) {
      await this.registerDevice();
    }
  }

  stop(): void {
    if (!this.socket) {
      return;
    }

    this.socket.disconnect();
    this.socket = null;
    this.started = false;
  }

  on<TEvent extends keyof SocketEventMap>(
    event: TEvent,
    listener: (payload: SocketEventMap[TEvent]) => void
  ): () => void {
    this.socket?.on(event, listener);
    return () => {
      this.socket?.off(event, listener);
    };
  }

  private async registerDevice(): Promise<void> {
    const deviceId = await deviceIdentityService.getDeviceId();
    this.socket?.emit('register_device', { deviceId });
  }
}

export const socketService = new SocketService();
