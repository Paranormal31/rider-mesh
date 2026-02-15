import { io, type Socket } from 'socket.io-client';

import { SOCKET_BASE_URL } from '@/src/config/api';

import { deviceIdentityService } from './deviceIdentityService';
import type { EmergencyControllerLocationPayload } from './emergencyControllerService';

export type NearbyAlertEvent = {
  alertId: string;
  victimDeviceId: string;
  victimName?: string | null;
  triggeredAt: number;
  location: EmergencyControllerLocationPayload | null;
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

type SocketEventMap = {
  'alert:new_nearby': NearbyAlertEvent;
  'alert:assigned': AlertAssignedEvent;
  'alert:cancelled': AlertCancelledEvent;
};

class SocketService {
  private socket: Socket | null = null;
  private started = false;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.socket = io(SOCKET_BASE_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      timeout: 8000,
    });

    this.socket.on('connect', () => {
      if (__DEV__) {
        console.log('[socket] connected');
      }
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

    if (__DEV__) {
      console.log('[socket] disconnected');
    }
    this.socket.disconnect();
    this.socket = null;
    this.started = false;
  }

  on<TEvent extends keyof SocketEventMap>(
    event: TEvent,
    listener: (payload: SocketEventMap[TEvent]) => void
  ): () => void {
    this.socket?.on(event as string, listener as (...args: unknown[]) => void);
    return () => {
      this.socket?.off(event as string, listener as (...args: unknown[]) => void);
    };
  }

  private async registerDevice(): Promise<void> {
    const deviceId = await deviceIdentityService.getDeviceId();
    if (__DEV__) {
      console.log('[socket] register_device', { deviceId });
    }
    this.socket?.emit('register_device', { deviceId });
  }
}

export const socketService = new SocketService();
