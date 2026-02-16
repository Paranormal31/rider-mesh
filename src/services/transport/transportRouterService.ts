import { networkMeshService, type NetworkMeshStatus } from '../networkMeshService';
import { settingsService } from '../settingsService';
import { bluetoothAlertTransport } from './bluetoothAlertTransport';
import type {
  AlertTransport,
  AlertTransportEventMap,
  AlertTransportListener,
  PublishResult,
  PublishTriggerResult,
  SOSAssignedPayload,
  SOSCancelledPayload,
  SOSTriggeredPayload,
  TransportStatusSnapshot,
} from './alertTransport';
import { internetAlertTransport } from './internetAlertTransport';

class TransportRouterService {
  private started = false;
  private settingsUnsubscribe: (() => void) | null = null;
  private listeners: {
    [K in keyof AlertTransportEventMap]: Set<AlertTransportListener<K>>;
  } = {
    nearby_alert: new Set(),
    assigned: new Set(),
    cancelled: new Set(),
  };
  private removeTransportListeners: (() => void)[] = [];
  private transports: AlertTransport[] = [bluetoothAlertTransport, internetAlertTransport];
  private assignedAlerts = new Set<string>();

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await settingsService.loadSettings();

    for (const transport of this.transports) {
      try {
        await transport.start();
      } catch {
        // Transports are independently optional.
      }
    }

    this.bindTransportEvents();

    this.settingsUnsubscribe = settingsService.on('SETTINGS_CHANGED', () => {
      void this.syncNetworkStatus();
    });

    await this.syncNetworkStatus();
    this.started = true;
  }

  stop(): void {
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    for (const off of this.removeTransportListeners) {
      off();
    }
    this.removeTransportListeners = [];

    for (const transport of this.transports) {
      transport.stop();
    }

    this.assignedAlerts.clear();
    this.started = false;
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

  async publishSosTriggered(payload: SOSTriggeredPayload): Promise<PublishTriggerResult> {
    const { primary, mirror } = this.resolvePublishPlan();
    if (!primary) {
      return { ok: false, alertId: payload.alertId, reason: 'No SOS transport available.' };
    }

    const result = await primary.publishSosTriggered(payload);

    if (mirror) {
      void mirror.publishSosTriggered(payload);
    }

    await this.syncNetworkStatus();
    return result;
  }

  async publishSosCancelled(payload: SOSCancelledPayload): Promise<PublishResult> {
    const { primary, mirror } = this.resolvePublishPlan();
    if (!primary) {
      return { ok: false, reason: 'No SOS transport available.' };
    }

    const result = await primary.publishSosCancelled(payload);
    if (mirror) {
      void mirror.publishSosCancelled(payload);
    }

    await this.syncNetworkStatus();
    return result;
  }

  async publishSosAssigned(payload: SOSAssignedPayload): Promise<PublishResult> {
    const { primary, mirror } = this.resolvePublishPlan();
    if (!primary) {
      return { ok: false, reason: 'No SOS transport available.' };
    }

    const primaryResult = await primary.publishSosAssigned(payload);
    if (mirror) {
      void mirror.publishSosAssigned(payload);
    }

    await this.syncNetworkStatus();
    return primaryResult;
  }

  getStatusSnapshot(): TransportStatusSnapshot {
    const settings = settingsService.getSettings();
    const bluetooth = bluetoothAlertTransport.getAvailability();
    const internet = internetAlertTransport.getAvailability();
    return {
      meshMode: settings.meshMode,
      bluetooth,
      internet,
      networkStatus: resolveNetworkStatus(settings.meshMode, bluetooth.canPublish, internet.canPublish),
    };
  }

  private bindTransportEvents(): void {
    for (const transport of this.transports) {
      this.removeTransportListeners.push(
        transport.on('nearby_alert', (payload) => {
          this.emit('nearby_alert', payload);
        })
      );
      this.removeTransportListeners.push(
        transport.on('assigned', (payload) => {
          if (this.assignedAlerts.has(payload.alertId)) {
            return;
          }
          this.assignedAlerts.add(payload.alertId);
          this.emit('assigned', payload);
        })
      );
      this.removeTransportListeners.push(
        transport.on('cancelled', (payload) => {
          this.emit('cancelled', payload);
        })
      );
    }
  }

  private resolvePublishPlan(): { primary: AlertTransport | null; mirror: AlertTransport | null } {
    const settings = settingsService.getSettings();
    const bluetoothAvailable = bluetoothAlertTransport.getAvailability().canPublish;
    const internetAvailable = internetAlertTransport.getAvailability().canPublish;

    if (settings.meshMode === 'FORCE_MESH') {
      return {
        primary: bluetoothAvailable ? bluetoothAlertTransport : null,
        mirror: null,
      };
    }

    if (settings.meshMode === 'FORCE_INTERNET') {
      return {
        primary: internetAvailable ? internetAlertTransport : null,
        mirror: null,
      };
    }

    if (bluetoothAvailable) {
      return {
        primary: bluetoothAlertTransport,
        mirror: internetAvailable ? internetAlertTransport : null,
      };
    }

    return {
      primary: internetAvailable ? internetAlertTransport : null,
      mirror: null,
    };
  }

  private async syncNetworkStatus(): Promise<void> {
    const snapshot = this.getStatusSnapshot();
    await networkMeshService.setStatus(snapshot.networkStatus);
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

function resolveNetworkStatus(
  meshMode: 'AUTO' | 'FORCE_MESH' | 'FORCE_INTERNET',
  bluetoothAvailable: boolean,
  internetAvailable: boolean
): NetworkMeshStatus {
  if (meshMode === 'FORCE_MESH') {
    return bluetoothAvailable ? 'MESH_ONLY' : 'OFFLINE';
  }

  if (meshMode === 'FORCE_INTERNET') {
    return internetAvailable ? 'INTERNET' : 'OFFLINE';
  }

  if (bluetoothAvailable && internetAvailable) {
    return 'HYBRID';
  }

  if (bluetoothAvailable) {
    return 'MESH_ONLY';
  }

  if (internetAvailable) {
    return 'INTERNET';
  }

  return 'OFFLINE';
}

export const transportRouterService = new TransportRouterService();
