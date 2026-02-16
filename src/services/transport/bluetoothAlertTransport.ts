import { Platform } from 'react-native';

import { deviceIdentityService } from '../deviceIdentityService';
import { meshCryptoService } from '../mesh/meshCrypto';
import { meshDedupStore } from '../mesh/meshDedupStore';
import { createEnvelope, parseEnvelope, serializeEnvelope, type MeshEnvelopeV1 } from '../mesh/meshEnvelope';
import type {
  AlertAssignedEvent,
  AlertCancelledEvent,
  AlertTransport,
  AlertTransportEventMap,
  AlertTransportListener,
  NearbyAlertEvent,
  PublishResult,
  PublishTriggerResult,
  SOSAssignedPayload,
  SOSCancelledPayload,
  SOSTriggeredPayload,
} from './alertTransport';

const MESH_SERVICE_UUID = '6a08d827-d31f-4d45-af58-4515cb2f44a5';

function createMessageId(): string {
  return `mesh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type BleDeviceLike = {
  id: string;
  name?: string | null;
  manufacturerData?: string | null;
  serviceData?: Record<string, string> | null;
};

class BluetoothAlertTransport implements AlertTransport {
  readonly id = 'bluetooth' as const;

  private started = false;
  private bleManager: any = null;
  private advertiser: any = null;
  private scanSubscription: { remove: () => void } | null = null;
  private listeners: {
    [K in keyof AlertTransportEventMap]: Set<AlertTransportListener<K>>;
  } = {
    nearby_alert: new Set(),
    assigned: new Set(),
    cancelled: new Set(),
  };

  private deviceId: string | null = null;
  private publicKey: string | null = null;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.deviceId = await deviceIdentityService.getDeviceId();
    const keyPair = await meshCryptoService.getOrCreateKeyPair();
    this.publicKey = keyPair.publicKey;
    await meshDedupStore.load();

    if (Platform.OS !== 'android') {
      this.started = true;
      return;
    }

    this.bleManager = this.loadBleManager();
    this.advertiser = this.loadAdvertiser();

    if (this.bleManager?.startDeviceScan) {
      this.bleManager.startDeviceScan([MESH_SERVICE_UUID], null, (error: unknown, device: BleDeviceLike | null) => {
        if (error || !device) {
          return;
        }

        const encoded = this.extractEnvelope(device);
        if (!encoded) {
          return;
        }

        void this.consumeReceivedEnvelope(encoded);
      });
    }

    this.started = true;
  }

  stop(): void {
    this.scanSubscription?.remove();
    this.scanSubscription = null;

    try {
      this.bleManager?.stopDeviceScan?.();
      this.advertiser?.stopBroadcast?.();
      this.advertiser?.stopAdvertising?.();
    } catch {
      // Ignore transport teardown errors.
    }

    this.started = false;
  }

  getAvailability() {
    const canUseBluetooth = Platform.OS === 'android' && this.started && !!this.bleManager;
    return {
      canPublish: canUseBluetooth,
      canReceive: canUseBluetooth,
    };
  }

  async publishSosTriggered(payload: SOSTriggeredPayload): Promise<PublishTriggerResult> {
    const envelope = await this.buildEnvelope('SOS_TRIGGERED', {
      alertId: payload.alertId,
      victimDeviceId: payload.victimDeviceId,
      victimName: payload.victimName,
      triggeredAt: payload.triggeredAt,
      location: payload.location,
      distanceMeters: 0,
    }, payload.maxHops);

    if (!envelope) {
      return { ok: false, reason: 'Bluetooth unavailable', alertId: payload.alertId };
    }

    await this.broadcastEnvelope(envelope);
    return { ok: true, alertId: payload.alertId };
  }

  async publishSosCancelled(payload: SOSCancelledPayload): Promise<PublishResult> {
    const envelope = await this.buildEnvelope('SOS_CANCELLED', payload, 2);
    if (!envelope) {
      return { ok: false, reason: 'Bluetooth unavailable' };
    }

    await this.broadcastEnvelope(envelope);
    return { ok: true };
  }

  async publishSosAssigned(payload: SOSAssignedPayload): Promise<PublishResult> {
    const envelope = await this.buildEnvelope('SOS_ASSIGNED', payload, 2);
    if (!envelope) {
      return { ok: false, reason: 'Bluetooth unavailable' };
    }

    await this.broadcastEnvelope(envelope);
    return { ok: true };
  }

  on<TEvent extends keyof AlertTransportEventMap>(
    event: TEvent,
    listener: AlertTransportListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private loadBleManager(): any {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require('react-native-ble-plx') as { BleManager?: new () => any };
      if (module.BleManager) {
        return new module.BleManager();
      }
      return null;
    } catch {
      return null;
    }
  }

  private loadAdvertiser(): any {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('react-native-ble-advertiser');
    } catch {
      return null;
    }
  }

  private extractEnvelope(device: BleDeviceLike): string | null {
    if (device.serviceData) {
      const maybeValue = device.serviceData[MESH_SERVICE_UUID];
      if (typeof maybeValue === 'string' && maybeValue.length > 0) {
        return maybeValue;
      }
    }

    if (typeof device.manufacturerData === 'string' && device.manufacturerData.length > 0) {
      return device.manufacturerData;
    }

    return null;
  }

  private async consumeReceivedEnvelope(rawEnvelope: string): Promise<void> {
    if (!this.deviceId) {
      return;
    }

    const parsed = parseEnvelope(rawEnvelope);
    if (!parsed.ok) {
      return;
    }

    const envelope = parsed.envelope;

    if (await meshDedupStore.has(envelope.messageId)) {
      return;
    }

    await meshDedupStore.remember(envelope.messageId, Date.now());

    if (envelope.originDeviceId === this.deviceId) {
      return;
    }

    this.emitEnvelope(envelope);

    if (envelope.hop < envelope.maxHops) {
      const relayed = await createEnvelope({
        messageId: envelope.messageId,
        originDeviceId: envelope.originDeviceId,
        originPublicKey: envelope.originPublicKey,
        type: envelope.type,
        createdAt: envelope.createdAt,
        hop: envelope.hop + 1,
        maxHops: envelope.maxHops,
        payload: envelope.payload,
      });
      await this.broadcastEnvelope(relayed);
    }
  }

  private async buildEnvelope(
    type: MeshEnvelopeV1['type'],
    payload: Record<string, unknown>,
    maxHops: number
  ): Promise<MeshEnvelopeV1 | null> {
    if (!this.deviceId || !this.publicKey || !this.started) {
      return null;
    }

    return createEnvelope({
      messageId: createMessageId(),
      originDeviceId: this.deviceId,
      originPublicKey: this.publicKey,
      type,
      createdAt: Date.now(),
      hop: 0,
      maxHops,
      payload,
    });
  }

  private async broadcastEnvelope(envelope: MeshEnvelopeV1): Promise<void> {
    const serialized = serializeEnvelope(envelope);

    try {
      if (this.advertiser?.broadcast) {
        await this.advertiser.broadcast(MESH_SERVICE_UUID, serialized);
        return;
      }

      if (this.advertiser?.startAdvertising) {
        await this.advertiser.startAdvertising(MESH_SERVICE_UUID, serialized);
        return;
      }

      if (this.advertiser?.advertiseData) {
        await this.advertiser.advertiseData(serialized);
      }
    } catch {
      // Bluetooth publish is best-effort. The internet transport can still mirror in AUTO mode.
    }
  }

  private emitEnvelope(envelope: MeshEnvelopeV1): void {
    if (envelope.type === 'SOS_TRIGGERED') {
      const payload = envelope.payload;
      const event: NearbyAlertEvent = {
        alertId: typeof payload.alertId === 'string' ? payload.alertId : '',
        victimDeviceId: typeof payload.victimDeviceId === 'string' ? payload.victimDeviceId : envelope.originDeviceId,
        victimName: typeof payload.victimName === 'string' ? payload.victimName : null,
        triggeredAt: typeof payload.triggeredAt === 'number' ? payload.triggeredAt : envelope.createdAt,
        location: isLocationPayload(payload.location) ? payload.location : null,
        distanceMeters: typeof payload.distanceMeters === 'number' ? payload.distanceMeters : 0,
      };
      this.emit('nearby_alert', event);
      return;
    }

    if (envelope.type === 'SOS_ASSIGNED') {
      const payload = envelope.payload;
      const event: AlertAssignedEvent = {
        alertId: typeof payload.alertId === 'string' ? payload.alertId : '',
        victimDeviceId: typeof payload.victimDeviceId === 'string' ? payload.victimDeviceId : '',
        responderDeviceId: typeof payload.responderDeviceId === 'string' ? payload.responderDeviceId : '',
        responderName: typeof payload.responderName === 'string' ? payload.responderName : null,
        assignedAt: typeof payload.assignedAt === 'number' ? payload.assignedAt : envelope.createdAt,
      };
      this.emit('assigned', event);
      return;
    }

    const payload = envelope.payload;
    const event: AlertCancelledEvent = {
      alertId: typeof payload.alertId === 'string' ? payload.alertId : '',
      cancelledAt: typeof payload.cancelledAt === 'number' ? payload.cancelledAt : envelope.createdAt,
    };
    this.emit('cancelled', event);
  }

  private emit<TEvent extends keyof AlertTransportEventMap>(
    event: TEvent,
    payload: AlertTransportEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

function isLocationPayload(value: unknown): value is NearbyAlertEvent['location'] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    latitude?: unknown;
    longitude?: unknown;
    timestamp?: unknown;
    breadcrumbTrail?: unknown;
  };

  return (
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    typeof candidate.timestamp === 'number' &&
    Array.isArray(candidate.breadcrumbTrail)
  );
}

export const bluetoothAlertTransport = new BluetoothAlertTransport();
