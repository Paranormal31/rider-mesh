import { ALERTS_API_URL, buildAlertStatusApiUrl } from '@/src/config/api';

import { alarmAudioService } from './alarmAudioService';
import { crashDetectionService, type CrashDetectedEvent } from './crashDetectionService';
import { locationService, type LocationPoint } from './locationService';
import { rideSessionService, type RideSession, type RideSessionState } from './rideSessionService';
import { settingsService, type UserSettings } from './settingsService';
import type { ServiceHealth } from './types';

type EmergencyControllerLocationPayload = {
  latitude: number;
  longitude: number;
  timestamp: number;
  breadcrumbTrail: LocationPoint[];
};

type EmergencyControllerState =
  | 'NORMAL'
  | 'ALERT_PRE_DELAY'
  | 'ALERT_PENDING'
  | 'ALERT_CANCELLED'
  | 'ALERT_ESCALATED';

type PreDelayStartedEvent = {
  type: 'PRE_DELAY_STARTED';
  startedAt: number;
  delaySeconds: number;
};

type CountdownStartedEvent = {
  type: 'COUNTDOWN_STARTED';
  startedAt: number;
  remainingSeconds: number;
};

type CountdownTickEvent = {
  type: 'COUNTDOWN_TICK';
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

type EmergencyControllerEventMap = {
  PRE_DELAY_STARTED: PreDelayStartedEvent;
  COUNTDOWN_STARTED: CountdownStartedEvent;
  COUNTDOWN_TICK: CountdownTickEvent;
  ALERT_TRIGGERED: AlertTriggeredEvent;
  CANCELLED: CancelledEvent;
};

type EmergencyControllerListener<TEvent extends keyof EmergencyControllerEventMap> = (
  payload: EmergencyControllerEventMap[TEvent]
) => void;

const DEFAULT_REENTRY_COOLDOWN_MS = 5000;
const DEFAULT_DEVICE_ID = 'dextrex-mobile-client';
const PRE_ALERT_DELAY_SECONDS = 10;
const CRASH_COUNTDOWN_SECONDS = 30;
const DETECTION_RESUME_DELAY_MS = 8000;

class EmergencyControllerService {
  private state: EmergencyControllerState = 'NORMAL';
  private countdownRemainingSeconds = 0;
  private countdownStartedAtMs: number | null = null;
  private preDelayTimerTimeout: ReturnType<typeof setTimeout> | null = null;
  private countdownTimerInterval: ReturnType<typeof setInterval> | null = null;
  private escalationTimerTimeout: ReturnType<typeof setTimeout> | null = null;
  private detectionResumeTimerTimeout: ReturnType<typeof setTimeout> | null = null;
  private crashUnsubscribe: (() => void) | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private rideStartedUnsubscribe: (() => void) | null = null;
  private rideEndedUnsubscribe: (() => void) | null = null;
  private running = false;
  private crashDetectionRunning = false;
  private reentryLockedUntilMs = 0;
  private lastAlertEvent: AlertTriggeredEvent | null = null;
  private activeAlertId: string | null = null;
  private createAlertInFlight: Promise<void> | null = null;
  private statusUpdateInFlight: 'CANCELLED' | 'ESCALATED' | null = null;
  private listeners: {
    [K in keyof EmergencyControllerEventMap]: Set<EmergencyControllerListener<K>>;
  } = {
    PRE_DELAY_STARTED: new Set(),
    COUNTDOWN_STARTED: new Set(),
    COUNTDOWN_TICK: new Set(),
    ALERT_TRIGGERED: new Set(),
    CANCELLED: new Set(),
  };

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    await rideSessionService.load();
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
    this.rideStartedUnsubscribe = rideSessionService.on('RIDE_STARTED', ({ session }) =>
      this.handleRideStateChanged(session.state)
    );
    this.rideEndedUnsubscribe = rideSessionService.on('RIDE_ENDED', ({ session }) =>
      this.handleRideStateChanged(session.state)
    );
    this.running = true;
    this.state = 'NORMAL';
    this.handleRideStateChanged(rideSessionService.getCurrentSession().state);
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
    this.rideStartedUnsubscribe?.();
    this.rideStartedUnsubscribe = null;
    this.rideEndedUnsubscribe?.();
    this.rideEndedUnsubscribe = null;
    this.running = false;
    this.state = 'NORMAL';
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = null;
    this.reentryLockedUntilMs = 0;
    this.activeAlertId = null;
    this.createAlertInFlight = null;
    this.statusUpdateInFlight = null;
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

  getCountdownRemainingSeconds(): number {
    return this.countdownRemainingSeconds;
  }

  getCountdownStartedAtMs(): number | null {
    return this.countdownStartedAtMs;
  }

  getLastAlertEvent(): AlertTriggeredEvent | null {
    return this.lastAlertEvent ? { ...this.lastAlertEvent } : null;
  }

  cancel(): void {
    if (
      (this.state !== 'ALERT_PRE_DELAY' && this.state !== 'ALERT_PENDING') ||
      this.statusUpdateInFlight === 'ESCALATED'
    ) {
      return;
    }

    const alertIdToCancel = this.activeAlertId;
    this.clearTimers();
    alarmAudioService.stop();
    this.state = 'ALERT_CANCELLED';
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = null;
    this.reentryLockedUntilMs = 0;
    this.activeAlertId = null;
    this.createAlertInFlight = null;
    if (alertIdToCancel) {
      void this.sendTerminalStatusUpdate(alertIdToCancel, 'CANCELLED');
    }
    this.emit('CANCELLED', {
      type: 'CANCELLED',
      cancelledAt: Date.now(),
    });
    this.scheduleDetectionResumeIfRideActive(DETECTION_RESUME_DELAY_MS);
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

    const settings = settingsService.getSettings();
    const triggeredAt = nowMs;
    const immediateLocation = this.buildImmediateLocationPayload();
    this.state = 'ALERT_PRE_DELAY';
    if (settings.alarmSoundEnabled) {
      alarmAudioService.start();
    }
    this.pauseDetectionForAlertFlow();
    void this.ensureAlertCreated(triggeredAt, immediateLocation);
    this.startPreAlertDelay(PRE_ALERT_DELAY_SECONDS, triggeredAt, immediateLocation);
  }

  async sendAlertNow(): Promise<boolean> {
    if (this.state !== 'ALERT_PRE_DELAY' && this.state !== 'ALERT_PENDING') {
      return false;
    }

    this.clearTimers();
    this.countdownRemainingSeconds = 0;
    await this.escalateAlert(Date.now(), this.buildImmediateLocationPayload());
    return true;
  }

  async triggerManualSos(): Promise<boolean> {
    if (!this.running) {
      return false;
    }
    if (
      this.state === 'ALERT_PRE_DELAY' ||
      this.state === 'ALERT_PENDING' ||
      this.state === 'ALERT_ESCALATED'
    ) {
      return false;
    }

    this.clearTimers();
    this.pauseDetectionForAlertFlow();
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = null;
    await this.escalateAlert(Date.now(), this.buildImmediateLocationPayload());
    return true;
  }

  private startPreAlertDelay(
    seconds: number,
    triggeredAt: number,
    immediateLocation: EmergencyControllerLocationPayload | null
  ): void {
    this.clearTimers();
    this.state = 'ALERT_PRE_DELAY';
    this.countdownRemainingSeconds = 0;
    this.countdownStartedAtMs = Date.now();

    this.emit('PRE_DELAY_STARTED', {
      type: 'PRE_DELAY_STARTED',
      startedAt: this.countdownStartedAtMs,
      delaySeconds: seconds,
    });

    this.preDelayTimerTimeout = setTimeout(() => {
      this.preDelayTimerTimeout = null;
      this.startCountdown(CRASH_COUNTDOWN_SECONDS, () => {
        void this.escalateAlert(triggeredAt, immediateLocation);
      });
    }, seconds * 1000);
  }

  private startCountdown(seconds: number, onTimeout: () => void): void {
    this.state = 'ALERT_PENDING';
    this.countdownRemainingSeconds = seconds;
    this.countdownStartedAtMs = Date.now();

    this.emit('COUNTDOWN_STARTED', {
      type: 'COUNTDOWN_STARTED',
      startedAt: this.countdownStartedAtMs,
      remainingSeconds: this.countdownRemainingSeconds,
    });

    this.countdownTimerInterval = setInterval(() => {
      this.countdownRemainingSeconds = Math.max(0, this.countdownRemainingSeconds - 1);
      this.emit('COUNTDOWN_TICK', {
        type: 'COUNTDOWN_TICK',
        remainingSeconds: this.countdownRemainingSeconds,
      });
    }, 1000);

    this.escalationTimerTimeout = setTimeout(() => {
      this.clearTimers();
      this.countdownRemainingSeconds = 0;
      this.countdownStartedAtMs = null;
      onTimeout();
    }, seconds * 1000);
  }

  private async escalateAlert(
    triggeredAt: number,
    immediateLocation: EmergencyControllerLocationPayload | null
  ): Promise<void> {
    if (this.statusUpdateInFlight) {
      return;
    }

    const now = Date.now();
    const settings = settingsService.getSettings();
    // Mark escalation state immediately to block late cancel attempts while network calls are in flight.
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
    if (alertIdToEscalate) {
      await this.sendTerminalStatusUpdate(alertIdToEscalate, 'ESCALATED');
    }
    this.emit('ALERT_TRIGGERED', eventPayload);
    this.reentryLockedUntilMs = now + DEFAULT_REENTRY_COOLDOWN_MS;
    alarmAudioService.stop();
    this.scheduleDetectionResumeIfRideActive(DETECTION_RESUME_DELAY_MS);
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

    this.createAlertInFlight = (async () => {
      const resolvedLocation = (await this.buildAlertLocationPayload()) ?? immediateLocation;
      const payload = {
        deviceId: DEFAULT_DEVICE_ID,
        status: 'TRIGGERED' as const,
        triggeredAt,
        location: resolvedLocation,
      };

      const alertId = await this.sendCreateAlertRequest(payload);
      if (alertId && this.state !== 'NORMAL' && this.state !== 'ALERT_CANCELLED') {
        this.activeAlertId = alertId;
      }
    })();

    try {
      await this.createAlertInFlight;
    } finally {
      this.createAlertInFlight = null;
    }
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
    status: 'TRIGGERED';
    triggeredAt: number;
    location: {
      latitude: number;
      longitude: number;
      timestamp: number;
      breadcrumbTrail: LocationPoint[];
    } | null;
  }): Promise<string | null> {
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

      const alertId = typeof body?.data?.id === 'string' ? body.data.id : null;
      console.log('[alerts] Alert sent successfully', { alertId, body });
      return alertId;
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
    const shouldAlarmBeActive = this.state === 'ALERT_PRE_DELAY' || this.state === 'ALERT_PENDING';
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

  private clearTimers(): void {
    if (this.preDelayTimerTimeout) {
      clearTimeout(this.preDelayTimerTimeout);
      this.preDelayTimerTimeout = null;
    }
    if (this.countdownTimerInterval) {
      clearInterval(this.countdownTimerInterval);
      this.countdownTimerInterval = null;
    }
    if (this.escalationTimerTimeout) {
      clearTimeout(this.escalationTimerTimeout);
      this.escalationTimerTimeout = null;
    }
  }

  private handleRideStateChanged(nextRideState: RideSessionState): void {
    if (nextRideState === 'ACTIVE') {
      if (!this.isAlertFlowActive()) {
        this.clearDetectionResumeTimer();
        void this.startDetectionIfRideActive();
      }
      return;
    }

    this.clearDetectionResumeTimer();
    this.stopDetection();
  }

  private isAlertFlowActive(): boolean {
    return this.state === 'ALERT_PRE_DELAY' || this.state === 'ALERT_PENDING';
  }

  private pauseDetectionForAlertFlow(): void {
    this.clearDetectionResumeTimer();
    this.stopDetection();
  }

  private scheduleDetectionResumeIfRideActive(delayMs: number): void {
    this.clearDetectionResumeTimer();
    if (!this.running) {
      return;
    }

    this.detectionResumeTimerTimeout = setTimeout(() => {
      this.detectionResumeTimerTimeout = null;
      void this.startDetectionIfRideActive();
    }, delayMs);
  }

  private clearDetectionResumeTimer(): void {
    if (this.detectionResumeTimerTimeout) {
      clearTimeout(this.detectionResumeTimerTimeout);
      this.detectionResumeTimerTimeout = null;
    }
  }

  private async startDetectionIfRideActive(): Promise<void> {
    if (!this.running || this.crashDetectionRunning || this.isAlertFlowActive()) {
      return;
    }

    const currentRide: RideSession = rideSessionService.getCurrentSession();
    if (currentRide.state !== 'ACTIVE') {
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
export type { EmergencyControllerLocationPayload, EmergencyControllerState };
