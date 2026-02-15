import type { Server as HttpServer } from 'node:http';

import { Server, type Socket } from 'socket.io';

import type { AlertRecord } from '../types/alert';

const DEVICE_EVENT = 'register_device';

function deviceRoom(deviceId: string): string {
  return `device:${deviceId}`;
}

export class SocketHub {
  private io: Server | null = null;

  init(server: HttpServer, corsOrigins: string[]): void {
    this.io = new Server(server, {
      cors: {
        origin: corsOrigins,
      },
    });

    this.io.on('connection', (socket: Socket) => {
      socket.on(DEVICE_EVENT, (payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
          return;
        }

        const maybeDeviceId = (payload as { deviceId?: unknown }).deviceId;
        if (typeof maybeDeviceId !== 'string' || !maybeDeviceId.trim()) {
          return;
        }

        socket.join(deviceRoom(maybeDeviceId.trim()));
      });
    });
  }

  emitNearbyAlert(alert: AlertRecord, nearby: Array<{ deviceId: string; distanceMeters: number }>): void {
    if (!this.io || !alert.location) {
      return;
    }

    for (const rider of nearby) {
      this.io.to(deviceRoom(rider.deviceId)).emit('alert:new_nearby', {
        alertId: alert.id,
        victimDeviceId: alert.deviceId,
        triggeredAt: alert.triggeredAt,
        location: alert.location,
        distanceMeters: rider.distanceMeters,
      });
    }
  }

  emitAlertAssigned(alert: AlertRecord): void {
    if (!this.io || !alert.responderDeviceId || !alert.assignedAt) {
      return;
    }

    const payload = {
      alertId: alert.id,
      victimDeviceId: alert.deviceId,
      responderDeviceId: alert.responderDeviceId,
      assignedAt: alert.assignedAt,
    };

    this.io.to(deviceRoom(alert.deviceId)).emit('alert:assigned', payload);
    this.io.to(deviceRoom(alert.responderDeviceId)).emit('alert:assigned', payload);
  }
}
