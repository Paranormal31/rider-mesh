import { ALERTS_API_URL, buildAlertStatusApiUrl } from '@/src/config/api';

import { alarmAudioService } from './alarmAudioService';
import { crashDetectionService, type CrashDetectedEvent } from './crashDetectionService';
import { deviceIdentityService } from './deviceIdentityService';
import { locationService, type LocationPoint } from './locationService';
import { profileService } from './profileService';
import { settingsService, type UserSettings } from './settingsService';
import { socketService, type AlertAssignedEvent } from './socketService';
import type { ServiceHealth } from './types';

type EmergencyControllerLocationPayload = {
  latitude: number;
  longitude: number;
  timestamp: number;
  breadcrumbTrail: LocationPoint[];
};

type EmergencyControllerState =
  | 'NORMAL'
  | 'WARNING_COUNTDOWN'
  | 'SOS_DISPATCHED'
  | 'ESCALATION_COUNTDOWN'
  | 'ALERT_CANCELLED'
  | 'ALERT_ESCALATED'
  | 'RESPONDER_ASSIGNED';

type WarningStartedEvent = {
  type: 'WARNING_STARTED';
  startedAt: number;
  remainingSeconds: number;
};

type WarningTickEvent = {
  type: 'WARNING_TICK';
  remainingSeconds: number;
};

type SosDispatchedEvent = {
  type: 'SOS_DISPATCHED';
  dispatchedAt: number;
  alertId: string | null;
  location: EmergencyControllerLocationPayload | null;
};

type EscalationCountdownStartedEvent = {
  type: 'ESCALATION_COUNTDOWN_STARTED';
  startedAt: number;
  remainingSeconds: number;
};

type EscalationCountdownTickEvent = {
  type: 'ESCALATION_COUNTDOWN_TICK';
  remainingSeconds: number;
};

type AlertTriggeredEvent = {
  type: 'ALERT_TRIGGERED';
  triggeredAt: number;
  alarmSoundEnabled: boolean;
  location: EmergencyControllerLocationPayload | null;
};

type CancelledEvent = {
  type: 'CANCELLED';
  cancelledAt: number;
};

type ResponderAssignedEvent = {
  type: 'RESPONDER_ASSIGNED';
  alertId: string;
  responderDeviceId: string;
  responderName: string | null;
  assignedAt: number;
};

type EmergencyControllerEventMap = {
  WARNING_STARTED: WarningStartedEvent;
  WARNING_TICK: WarningTickEvent;
  SOS_DISPATCHED: SosDispatchedEvent;
  ESCALATION_COUNTDOWN_STARTED: EscalationCountdownStartedEvent;
  ESCALATION_COUNTDOWN_TICK: EscalationCountdownTickEvent;
  ALERT_TRIGGERED: AlertTriggeredEvent;
  CANCELLED: CancelledEvent;
  RESPONDER_ASSIGNED: ResponderAssignedEvent;
};

type EmergencyControllerListener<TEvent extends keyof EmergencyControllerEventMap> = (
  payload: EmergencyControllerEventMap[TEvent]
) => void;

const WARNING_COUNTDOWN_SECONDS = 10;
const ESCALATION_COUNTDOWN_SECONDS = 30;
const DETECTION_RESUME_DELAY_MS = 5000;
const DEFAULT_REENTRY_COOLDOWN_MS = 5000;

class EmergencyControllerService {
  private state: EmergencyControllerState = 'NORMAL';
  private deviceId: string | null = null;
  private victimName: string | null = null;
  private warningRemainingSeconds = 0;
  private warningStartedAtMs: number | null = null;
  private escalationRemainingSeconds = 0;
  private escalationStartedAtMs: number | null = null;
  private warningTimerInterval: ReturnType<typeof setInterval> | null = null;
  private warningTimerTimeout: ReturnType<typeof setTimeout> | null = null;
  private escalationTimerInterval: ReturnType<typeof setInterval> | null = null;
  private escalationTimerTimeout: ReturnType<typeof setTimeout> | null = null;
  private detectionResumeTimerTimeout: ReturnType<typeof setTimeout> | null = null;
  private crashUnsubscribe: (() => void) | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private socketAssignedUnsubscribe: (() => void) | null = null;
  private running = false;
  private crashDetectionRunning = false;
  private reentryLockedUntilMs = 0;
  private lastAlertEvent: AlertTriggeredEvent | null = null;
  private activeAlertId: string | null = null;
  private activeIncidentTriggeredAt: number | null = null;
  private createAlertInFlight: Promise<void> | null = null;
  private statusUpdateInFlight: 'CANCELLED' | 'ESCALATED' | null = null;
  private listeners: {
    [K in keyof EmergencyControllerEventMap]: Set<EmergencyControllerListener<K>>;
  } = {
    WARNING_STARTED: new Set(),
    WARNING_TICK: new Set(),
    SOS_DISPATCHED: new Set(),
    ESCALATION_COUNTDOWN_STARTED: new Set(),
    ESCALATION_COUNTDOWN_TICK: new Set(),
    ALERT_TRIGGERED: new Set(),
    CANCELLED: new Set(),
    RESPONDER_ASSIGNED: new Set(),
  };

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.deviceId = await deviceIdentityService.getDeviceId();
    const profile = await profileService.getProfile();
    this.victimName = profile?.name?.trim() ? profile.name.trim() : null;
    await socketService.start();
    this.socketAssignedUnsubscribe = socketService.on('alert:assigned', (event) => {
      this.handleAlertAssigned(event);
    });

    await crashDetectionService.start();
    this.crashDetectionRunning = true;
    const settings = settingsService.getSettings();
    if (settings.breadcrumbTrackingEnabled) {
      void locationService.startTracking().catch(() => {
        // Location is optional. Crash flow must continue even when permission is denied.
      });
    } else {
      locationService.stopTracking();
    }

    this.settingsUnsubscribe = settingsService.on('SETTINGS_CHANGED', ({ settings: nextSettings }) => {
      this.handleSettingsChanged(nextSettings);
    });

    this.crashUnsubscribe = crashDetectionService.on('CRASH_DETECTED', (event) =>
      this.handleCrashDetected(event)
    );
    this.running = true;
    this.state = 'NORMAL';
  }

  stop(): void {
    this.clearTimers();
    this.clearDetectionResumeTimer();
    this.stopDetection();
    alarmAudioService.stop();
    this.crashUnsubscribe?.();
    this.crashUnsubscribe = null;
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    this.socketAssignedUnsubscribe?.();
    this.socketAssignedUnsubscribe = null;
    this.running = false;
    this.state = 'NORMAL';
    this.warningRemainingSeconds = 0;
    this.warningStartedAtMs = null;
    this.escalationRemainingSeconds = 0;
    this.escalationStartedAtMs = null;
    this.reentryLockedUntilMs = 0;
    this.activeAlertId = null;
    this.victimName = null;
    this.activeIncidentTriggeredAt = null;
    this.createAlertInFlight = null;
    this.statusUpdateInFlight = null;
    this.crashDetectionRunning = false;
    crashDetectionService.stop();
    locationService.stopTracking();
  }

  on<TEvent extends keyof EmergencyControllerEventMap>(
    event: TEvent,
    listener: EmergencyControllerListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  getState(): EmergencyControllerState {
    return this.state;
  }

  getWarningRemainingSeconds(): number {
    return this.warningRemainingSeconds;
  }

  getEscalationRemainingSeconds(): number {
    return this.escalationRemainingSeconds;
  }

  getCountdownRemainingSeconds(): number {
    if (this.state === 'WARNING_COUNTDOWN') {
      return this.warningRemainingSeconds;
    }
    if (this.state === 'ESCALATION_COUNTDOWN') {
      return this.escalationRemainingSeconds;
    }
    return 0;
  }

  getCountdownStartedAtMs(): number | null {
    if (this.state === 'WARNING_COUNTDOWN') {
      return this.warningStartedAtMs;
    }
    if (this.state === 'ESCALATION_COUNTDOWN') {
      return this.escalationStartedAtMs;
    }
    return null;
  }

  getLastAlertEvent(): AlertTriggeredEvent | null {
    return this.lastAlertEvent ? { ...this.lastAlertEvent } : null;
  }

  cancel(): void {
    if (
      (this.state !== 'WARNING_COUNTDOWN' &&
        this.state !== 'SOS_DISPATCHED' &&
        this.state !== 'ESCALATION_COUNTDOWN') ||
      this.statusUpdateInFlight === 'ESCALATED'
    ) {
      return;
    }

    const alertIdToCancel = this.activeAlertId;
    this.clearTimers();
    alarmAudioService.stop();
    this.state = 'ALERT_CANCELLED';
    this.warningRemainingSeconds = 0;
    this.warningStartedAtMs = null;
    this.escalationRemainingSeconds = 0;
    this.escalationStartedAtMs = null;
    this.reentryLockedUntilMs = 0;
    this.activeIncidentTriggeredAt = null;
    this.activeAlertId = null;
    this.createAlertInFlight = null;

    if (alertIdToCancel) {
      void this.sendTerminalStatusUpdate(alertIdToCancel, 'CANCELLED');
    }

    this.emit('CANCELLED', {
      type: 'CANCELLED',
      cancelledAt: Date.now(),
    });
    this.scheduleDetectionResume(DETECTION_RESUME_DELAY_MS);
    this.state = 'NORMAL';
  }

  getHealth(): ServiceHealth {
    const isActive = this.running || this.state !== 'NORMAL';
    return {
      name: 'Emergency Controller',
      state: isActive ? 'active' : 'idle',
      detail: `State: ${this.state}`,
    };
  }

  private handleCrashDetected(_: CrashDetectedEvent): void {
    if (!this.running) {
      return;
    }

    const nowMs = Date.now();
    if (nowMs < this.reentryLockedUntilMs) {
      return;
    }

    if (this.isAlertFlowActive()) {
      return;
    }

    this.activeIncidentTriggeredAt = nowMs;
    this.pauseDetectionForAlertFlow();
    this.startWarningCountdown(WARNING_COUNTDOWN_SECONDS, nowMs);
  }

  async sendAlertNow(): Promise<boolean> {
    if (this.state !== 'WARNING_COUNTDOWN') {
      return false;
    }

    this.clearWarningTimers();
    const triggeredAt = this.activeIncidentTriggeredAt ?? Date.now();
    await this.dispatchSosAndStartEscalation(triggeredAt, this.buildImmediateLocationPayload());
    return true;
  }

  async triggerManualSos(): Promise<boolean> {
    if (!this.running) {
      return false;
    }
    if (Date.now() < this.reentryLockedUntilMs) {
      return false;
    }
    if (this.isAlertFlowActive() || this.state === 'ALERT_ESCALATED') {
      return false;
    }

    this.clearTimers();
    this.pauseDetectionForAlertFlow();
    const triggeredAt = Date.now();
    this.activeIncidentTriggeredAt = triggeredAt;
    await this.dispatchSosAndStartEscalation(triggeredAt, this.buildImmediateLocationPayload());
    return true;
  }

  private startWarningCountdown(seconds: number, triggeredAt: number): void {
    this.clearTimers();
    this.state = 'WARNING_COUNTDOWN';
    this.warningRemainingSeconds = seconds;
    this.warningStartedAtMs = Date.now();
    this.escalationRemainingSeconds = 0;
    this.escalationStartedAtMs = null;

    const settings = settingsService.getSettings();
    if (settings.alarmSoundEnabled) {
      alarmAudioService.start();
    }

    this.emit('WARNING_STARTED', {
      type: 'WARNING_STARTED',
      startedAt: this.warningStartedAtMs,
      remainingSeconds: this.warningRemainingSeconds,
    });

    this.warningTimerInterval = setInterval(() => {
      this.warningRemainingSeconds = Math.max(0, this.warningRemainingSeconds - 1);
      this.emit('WARNING_TICK', {
        type: 'WARNING_TICK',
        remainingSeconds: this.warningRemainingSeconds,
      });
    }, 1000);

    this.warningTimerTimeout = setTimeout(() => {
      this.clearWarningTimers();
      if (this.state !== 'WARNING_COUNTDOWN') {
        return;
      }
      this.warningRemainingSeconds = 0;
      this.warningStartedAtMs = null;
      void this.dispatchSosAndStartEscalation(triggeredAt, this.buildImmediateLocationPayload());
    }, seconds * 1000);
  }

  private async dispatchSosAndStartEscalation(
    triggeredAt: number,
    immediateLocation: EmergencyControllerLocationPayload | null
  ): Promise<void> {
    await this.ensureAlertCreated(triggeredAt, immediateLocation);

    const dispatchedAt = Date.now();
    this.state = 'SOS_DISPATCHED';
    this.emit('SOS_DISPATCHED', {
      type: 'SOS_DISPATCHED',
      dispatchedAt,
      alertId: this.activeAlertId,
      location: immediateLocation,
    });

    alarmAudioService.stop();
    this.startEscalationCountdown(ESCALATION_COUNTDOWN_SECONDS, triggeredAt, immediateLocation);
  }

  private startEscalationCountdown(
    seconds: number,
    triggeredAt: number,
    immediateLocation: EmergencyControllerLocationPayload | null
  ): void {
    this.clearEscalationTimers();
    this.state = 'ESCALATION_COUNTDOWN';
    this.escalationRemainingSeconds = seconds;
    this.escalationStartedAtMs = Date.now();

    this.emit('ESCALATION_COUNTDOWN_STARTED', {
      type: 'ESCALATION_COUNTDOWN_STARTED',
      startedAt: this.escalationStartedAtMs,
      remainingSeconds: this.escalationRemainingSeconds,
    });

    this.escalationTimerInterval = setInterval(() => {
      this.escalationRemainingSeconds = Math.max(0, this.escalationRemainingSeconds - 1);
      this.emit('ESCALATION_COUNTDOWN_TICK', {
        type: 'ESCALATION_COUNTDOWN_TICK',
        remainingSeconds: this.escalationRemainingSeconds,
      });
    }, 1000);

    this.escalationTimerTimeout = setTimeout(() => {
      this.clearEscalationTimers();
      if (this.state !== 'ESCALATION_COUNTDOWN') {
        return;
      }
      this.escalationRemainingSeconds = 0;
      this.escalationStartedAtMs = null;
      void this.escalateAlert(triggeredAt, immediateLocation);
    }, seconds * 1000);
  }

  private async escalateAlert(
    triggeredAt: number,
    immediateLocation: EmergencyControllerLocationPayload | null
  ): Promise<void> {
    if (this.statusUpdateInFlight) {
      return;
    }

    this.clearEscalationTimers();
    const now = Date.now();
    const settings = settingsService.getSettings();
    this.state = 'ALERT_ESCALATED';
    await this.ensureAlertCreated(triggeredAt, immediateLocation);
    const eventPayload: AlertTriggeredEvent = {
      type: 'ALERT_TRIGGERED',
      triggeredAt: now,
      alarmSoundEnabled: settings.alarmSoundEnabled,
      location: immediateLocation,
    };
    this.lastAlertEvent = eventPayload;
    const alertIdToEscalate = this.activeAlertId;
    this.activeAlertId = null;
    this.activeIncidentTriggeredAt = null;
    if (alertIdToEscalate) {
      await this.sendTerminalStatusUpdate(alertIdToEscalate, 'ESCALATED');
    }
    this.emit('ALERT_TRIGGERED', eventPayload);
    this.reentryLockedUntilMs = now + DEFAULT_REENTRY_COOLDOWN_MS;
    alarmAudioService.stop();
    this.scheduleDetectionResume(DETECTION_RESUME_DELAY_MS);
  }

  private async sendTerminalStatusUpdate(
    alertId: string,
    status: 'CANCELLED' | 'ESCALATED'
  ): Promise<void> {
    if (this.statusUpdateInFlight) {
      return;
    }

    this.statusUpdateInFlight = status;
    try {
      await this.sendUpdateAlertStatusRequest(alertId, status);
    } finally {
      if (this.statusUpdateInFlight === status) {
        this.statusUpdateInFlight = null;
      }
    }
  }

  private buildImmediateLocationPayload(): EmergencyControllerLocationPayload | null {
    const includeBreadcrumbs = settingsService.getSettings().breadcrumbTrackingEnabled;
    const breadcrumbTrail = includeBreadcrumbs ? locationService.getBreadcrumbTrail(10) : [];
    const lastPoint = breadcrumbTrail[breadcrumbTrail.length - 1];

    if (!lastPoint) {
      return null;
    }

    return {
      latitude: lastPoint.latitude,
      longitude: lastPoint.longitude,
      timestamp: lastPoint.timestamp,
      breadcrumbTrail,
    };
  }

  private async ensureAlertCreated(
    triggeredAt: number,
    immediateLocation: EmergencyControllerLocationPayload | null
  ): Promise<void> {
    if (this.activeAlertId) {
      return;
    }

    if (this.createAlertInFlight) {
      await this.createAlertInFlight;
      return;
    }

    const createPromise = (async () => {
      const deviceId = this.deviceId ?? (await deviceIdentityService.getDeviceId());
      const payload = {
        deviceId,
        victimName: this.victimName,
        status: 'TRIGGERED' as const,
        triggeredAt,
        // Use immediately available payload to avoid blocking the countdown edge on GPS lookup.
        location: immediateLocation,
      };

      const response = await this.sendCreateAlertRequest(payload);
      if (response?.id) {
        this.activeAlertId = response.id;
      }
    })();

    this.createAlertInFlight = createPromise;
    try {
      await createPromise;
    } finally {
      if (this.createAlertInFlight === createPromise) {
        this.createAlertInFlight = null;
      }
    }
  }

  private handleAlertAssigned(event: AlertAssignedEvent): void {
    if (!this.running) {
      return;
    }

    if (this.deviceId && event.victimDeviceId !== this.deviceId) {
      return;
    }

    if (this.activeAlertId && event.alertId !== this.activeAlertId) {
      return;
    }

    this.clearTimers();
    this.state = 'RESPONDER_ASSIGNED';
    this.activeAlertId = null;
    this.activeIncidentTriggeredAt = null;
    alarmAudioService.stop();
    this.scheduleDetectionResume(DETECTION_RESUME_DELAY_MS);

    this.emit('RESPONDER_ASSIGNED', {
      type: 'RESPONDER_ASSIGNED',
      alertId: event.alertId,
      responderDeviceId: event.responderDeviceId,
      responderName: event.responderName?.trim() ? event.responderName : null,
      assignedAt: event.assignedAt,
    });
  }

  private async buildAlertLocationPayload(): Promise<EmergencyControllerLocationPayload | null> {
    const includeBreadcrumbs = settingsService.getSettings().breadcrumbTrackingEnabled;
    const breadcrumbTrail = includeBreadcrumbs ? locationService.getBreadcrumbTrail(10) : [];

    try {
      const currentLocation = await locationService.getCurrentLocation();
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        timestamp: currentLocation.timestamp,
        breadcrumbTrail,
      };
    } catch {
      return null;
    }
  }

  private async sendCreateAlertRequest(payload: {
    deviceId: string;
    victimName: string | null;
    status: 'TRIGGERED';
    triggeredAt: number;
    location: {
      latitude: number;
      longitude: number;
      timestamp: number;
      breadcrumbTrail: LocationPoint[];
    } | null;
  }): Promise<{ id: string } | null> {
    try {
      const response = await fetch(ALERTS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as
        | { data?: { id?: string } }
        | null;

      if (!response.ok) {
        console.error('[alerts] Failed to send alert', {
          url: ALERTS_API_URL,
          status: response.status,
          body,
        });
        return null;
      }

      console.log('[alerts] Alert sent successfully', body);
      if (
        body &&
        typeof body === 'object' &&
        typeof (body as { data?: { id?: unknown } }).data?.id === 'string'
      ) {
        return { id: (body as { data: { id: string } }).data.id };
      }
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[alerts] Network error while sending alert', {
        url: ALERTS_API_URL,
        reason,
      });
      return null;
    }
  }

  private async sendUpdateAlertStatusRequest(
    alertId: string,
    status: 'CANCELLED' | 'ESCALATED'
  ): Promise<void> {
    const url = buildAlertStatusApiUrl(alertId);
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const body = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        if (
          status === 'CANCELLED' &&
          response.status === 400 &&
          this.isStaleEscalatedTransition(body)
        ) {
          console.warn('[alerts] Cancel skipped because alert was already escalated', {
            url,
            status: response.status,
            body,
            nextStatus: status,
            alertId,
          });
          return;
        }

        console.error('[alerts] Failed to update alert status', {
          url,
          status: response.status,
          body,
          nextStatus: status,
          alertId,
        });
        return;
      }

      console.log('[alerts] Alert status updated successfully', { alertId, nextStatus: status, body });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[alerts] Network error while updating alert status', {
        url,
        reason,
        nextStatus: status,
        alertId,
      });
    }
  }

  private isStaleEscalatedTransition(body: unknown): boolean {
    if (!body || typeof body !== 'object') {
      return false;
    }

    const maybeError = (body as { error?: { details?: { message?: unknown }[] } }).error;
    const details = Array.isArray(maybeError?.details) ? maybeError.details : [];

    return details.some((detail) => {
      if (!detail || typeof detail !== 'object') {
        return false;
      }
      const message = detail.message;
      return (
        typeof message === 'string' &&
        message.includes('Cannot transition from ESCALATED to CANCELLED')
      );
    });
  }

  private handleSettingsChanged(settings: UserSettings): void {
    const shouldAlarmBeActive = this.state === 'WARNING_COUNTDOWN';
    if (!settings.alarmSoundEnabled) {
      alarmAudioService.stop();
    } else if (shouldAlarmBeActive && !alarmAudioService.isPlaying()) {
      alarmAudioService.start();
    }

    if (!this.running) {
      return;
    }

    if (settings.breadcrumbTrackingEnabled) {
      void locationService.startTracking().catch(() => {
        // Location is optional. Crash flow must continue even when permission is denied.
      });
      return;
    }

    locationService.stopTracking();
  }

  private clearWarningTimers(): void {
    if (this.warningTimerInterval) {
      clearInterval(this.warningTimerInterval);
      this.warningTimerInterval = null;
    }
    if (this.warningTimerTimeout) {
      clearTimeout(this.warningTimerTimeout);
      this.warningTimerTimeout = null;
    }
  }

  private clearEscalationTimers(): void {
    if (this.escalationTimerInterval) {
      clearInterval(this.escalationTimerInterval);
      this.escalationTimerInterval = null;
    }
    if (this.escalationTimerTimeout) {
      clearTimeout(this.escalationTimerTimeout);
      this.escalationTimerTimeout = null;
    }
  }

  private clearTimers(): void {
    this.clearWarningTimers();
    this.clearEscalationTimers();
  }

  private isAlertFlowActive(): boolean {
    return (
      this.state === 'WARNING_COUNTDOWN' ||
      this.state === 'SOS_DISPATCHED' ||
      this.state === 'ESCALATION_COUNTDOWN'
    );
  }

  private pauseDetectionForAlertFlow(): void {
    this.clearDetectionResumeTimer();
    this.stopDetection();
  }

  private scheduleDetectionResume(delayMs: number): void {
    this.clearDetectionResumeTimer();
    if (!this.running) {
      return;
    }

    this.detectionResumeTimerTimeout = setTimeout(() => {
      this.detectionResumeTimerTimeout = null;
      void this.startDetectionIfNeeded();
    }, delayMs);
  }

  private clearDetectionResumeTimer(): void {
    if (this.detectionResumeTimerTimeout) {
      clearTimeout(this.detectionResumeTimerTimeout);
      this.detectionResumeTimerTimeout = null;
    }
  }

  private async startDetectionIfNeeded(): Promise<void> {
    if (!this.running || this.crashDetectionRunning || this.isAlertFlowActive()) {
      return;
    }

    try {
      await crashDetectionService.start();
      this.crashDetectionRunning = true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[crash-detection] Failed to start detection', { reason });
    }
  }

  private stopDetection(): void {
    if (!this.crashDetectionRunning) {
      return;
    }
    crashDetectionService.stop();
    this.crashDetectionRunning = false;
  }

  private emit<TEvent extends keyof EmergencyControllerEventMap>(
    event: TEvent,
    payload: EmergencyControllerEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

export const emergencyControllerService = new EmergencyControllerService();
export type { EmergencyControllerLocationPayload, EmergencyControllerState, ResponderAssignedEvent };
