import { Accelerometer } from 'expo-sensors';
import type { AccelerometerMeasurement } from 'expo-sensors';

import type { ServiceHealth } from './types';

type SensorSubscription = {
  remove: () => void;
};

export type CrashDetectionPhase = 'IDLE' | 'SPIKE_DETECTED' | 'WAITING_FOR_STILLNESS';

export type PhaseChangeReason =
  | 'SPIKE'
  | 'STILLNESS_CONFIRMED'
  | 'TIMEOUT'
  | 'RESET'
  | 'COOLDOWN_LOCKED';

export type SpikeOrientation = {
  x: number;
  y: number;
  z: number;
};

export type CrashDetectedEvent = {
  type: 'CRASH_DETECTED';
  timestamp: number;
  totalAcceleration: number;
  threshold: number;
  sample: AccelerometerMeasurement;
  spikeTimestamp: number;
  spikeOrientation: SpikeOrientation;
  confirmation: {
    spikeThresholdG: number;
    stillnessThresholdG: number;
    stillnessWindowMs: number;
    spikeTimeoutMs: number;
  };
};

export type DetectionPhaseChangedEvent = {
  type: 'DETECTION_PHASE_CHANGED';
  fromPhase: CrashDetectionPhase;
  toPhase: CrashDetectionPhase;
  timestamp: number;
  reason?: PhaseChangeReason;
};

type CrashDetectionEventMap = {
  CRASH_DETECTED: CrashDetectedEvent;
  DETECTION_PHASE_CHANGED: DetectionPhaseChangedEvent;
};

type CrashDetectionListener<TEvent extends keyof CrashDetectionEventMap> = (
  payload: CrashDetectionEventMap[TEvent]
) => void;

export type CrashDetectionConfig = {
  spikeThresholdG: number;
  stillnessThresholdG: number;
  stillnessWindowMs: number;
  spikeTimeoutMs: number;
  cooldownMs: number;
  updateIntervalMs: number;
};

const DEFAULT_CONFIG: CrashDetectionConfig = {
  spikeThresholdG: 2.5,
  stillnessThresholdG: 1.2,
  stillnessWindowMs: 1200,
  spikeTimeoutMs: 3000,
  cooldownMs: 4000,
  updateIntervalMs: 100,
};

class CrashDetectionService {
  private running = false;
  private subscription: SensorSubscription | null = null;
  private lockUntilMs = 0;
  private phase: CrashDetectionPhase = 'IDLE';
  private spikeTimestampMs: number | null = null;
  private spikeOrientation: SpikeOrientation | null = null;
  private stillnessStartedAtMs: number | null = null;
  private hasReportedCooldownLock = false;
  private config: CrashDetectionConfig = { ...DEFAULT_CONFIG };
  private listeners: {
    [K in keyof CrashDetectionEventMap]: Set<CrashDetectionListener<K>>;
  } = {
    CRASH_DETECTED: new Set(),
    DETECTION_PHASE_CHANGED: new Set(),
  };

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const isAvailable = await Accelerometer.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Accelerometer is not available on this device.');
    }

    this.running = true;
    Accelerometer.setUpdateInterval(this.config.updateIntervalMs);
    this.subscription = Accelerometer.addListener((sample) => this.handleSample(sample));
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.running = false;
    this.resetPhase('RESET');
  }

  on<TEvent extends keyof CrashDetectionEventMap>(
    event: TEvent,
    listener: CrashDetectionListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  getPhase(): CrashDetectionPhase {
    return this.phase;
  }

  resetPhase(reason: PhaseChangeReason = 'RESET'): void {
    this.stillnessStartedAtMs = null;
    this.spikeTimestampMs = null;
    this.spikeOrientation = null;
    const fromPhase = this.phase;
    this.phase = 'IDLE';

    if (fromPhase !== 'IDLE' || reason === 'RESET') {
      this.emit('DETECTION_PHASE_CHANGED', {
        type: 'DETECTION_PHASE_CHANGED',
        fromPhase,
        toPhase: this.phase,
        timestamp: Date.now(),
        reason,
      });
    }
  }

  setThreshold(nextThreshold: number): void {
    this.setSpikeThresholdG(nextThreshold);
  }

  setSpikeThresholdG(nextThreshold: number): void {
    if (nextThreshold <= 0) {
      throw new Error('Spike threshold must be greater than 0.');
    }

    if (this.config.stillnessThresholdG >= nextThreshold) {
      throw new Error('stillnessThresholdG must be less than spikeThresholdG.');
    }

    this.config.spikeThresholdG = nextThreshold;
  }

  setStillnessThresholdG(nextThreshold: number): void {
    if (nextThreshold <= 0) {
      throw new Error('Stillness threshold must be greater than 0.');
    }

    if (nextThreshold >= this.config.spikeThresholdG) {
      throw new Error('stillnessThresholdG must be less than spikeThresholdG.');
    }

    this.config.stillnessThresholdG = nextThreshold;
  }

  setStillnessWindowMs(nextStillnessWindowMs: number): void {
    if (nextStillnessWindowMs <= 0) {
      throw new Error('Stillness window must be greater than 0.');
    }

    this.config.stillnessWindowMs = nextStillnessWindowMs;
  }

  setSpikeTimeoutMs(nextSpikeTimeoutMs: number): void {
    if (nextSpikeTimeoutMs <= 0) {
      throw new Error('Spike timeout must be greater than 0.');
    }

    this.config.spikeTimeoutMs = nextSpikeTimeoutMs;
  }

  setCooldownMs(nextCooldownMs: number): void {
    if (nextCooldownMs < 0) {
      throw new Error('Cooldown must be 0 or greater.');
    }

    this.config.cooldownMs = nextCooldownMs;
  }

  setUpdateIntervalMs(nextUpdateIntervalMs: number): void {
    if (nextUpdateIntervalMs <= 0) {
      throw new Error('Update interval must be greater than 0.');
    }

    this.config.updateIntervalMs = nextUpdateIntervalMs;
    if (this.running) {
      Accelerometer.setUpdateInterval(nextUpdateIntervalMs);
    }
  }

  getConfig(): CrashDetectionConfig {
    return { ...this.config };
  }

  getHealth(): ServiceHealth {
    return {
      name: 'Crash Detection Service',
      state: this.running ? 'active' : 'idle',
      detail: this.running
        ? `Monitoring accelerometer stream. Phase: ${this.phase}`
        : 'Monitoring has not started.',
    };
  }

  private handleSample(sample: AccelerometerMeasurement): void {
    if (!this.running) {
      return;
    }

    const nowMs = Date.now();
    if (nowMs < this.lockUntilMs) {
      if (!this.hasReportedCooldownLock) {
        this.hasReportedCooldownLock = true;
        this.emit('DETECTION_PHASE_CHANGED', {
          type: 'DETECTION_PHASE_CHANGED',
          fromPhase: this.phase,
          toPhase: this.phase,
          timestamp: nowMs,
          reason: 'COOLDOWN_LOCKED',
        });
      }
      return;
    }

    const totalAcceleration = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);

    if (this.phase === 'IDLE') {
      if (totalAcceleration >= this.config.spikeThresholdG) {
        this.spikeTimestampMs = nowMs;
        this.spikeOrientation = this.getNormalizedOrientation(sample, totalAcceleration);
        this.transitionPhase('SPIKE_DETECTED', 'SPIKE', nowMs);
        this.transitionPhase('WAITING_FOR_STILLNESS', 'SPIKE', nowMs);
      }
      return;
    }

    if (this.phase !== 'WAITING_FOR_STILLNESS') {
      return;
    }

    if (!this.spikeTimestampMs || !this.spikeOrientation) {
      this.resetPhase('RESET');
      return;
    }

    if (nowMs - this.spikeTimestampMs > this.config.spikeTimeoutMs) {
      this.resetPhase('TIMEOUT');
      return;
    }

    if (totalAcceleration <= this.config.stillnessThresholdG) {
      this.stillnessStartedAtMs ??= nowMs;

      if (nowMs - this.stillnessStartedAtMs >= this.config.stillnessWindowMs) {
        this.lockUntilMs = nowMs + this.config.cooldownMs;
        this.hasReportedCooldownLock = false;
        this.emit('CRASH_DETECTED', {
          type: 'CRASH_DETECTED',
          timestamp: nowMs,
          totalAcceleration,
          threshold: this.config.spikeThresholdG,
          sample,
          spikeTimestamp: this.spikeTimestampMs,
          spikeOrientation: this.spikeOrientation,
          confirmation: {
            spikeThresholdG: this.config.spikeThresholdG,
            stillnessThresholdG: this.config.stillnessThresholdG,
            stillnessWindowMs: this.config.stillnessWindowMs,
            spikeTimeoutMs: this.config.spikeTimeoutMs,
          },
        });
        this.resetPhase('STILLNESS_CONFIRMED');
      }
      return;
    }

    this.stillnessStartedAtMs = null;
  }

  private transitionPhase(
    nextPhase: CrashDetectionPhase,
    reason: PhaseChangeReason,
    timestamp: number
  ): void {
    const fromPhase = this.phase;
    this.phase = nextPhase;
    this.emit('DETECTION_PHASE_CHANGED', {
      type: 'DETECTION_PHASE_CHANGED',
      fromPhase,
      toPhase: nextPhase,
      timestamp,
      reason,
    });
  }

  private getNormalizedOrientation(
    sample: AccelerometerMeasurement,
    magnitude: number
  ): SpikeOrientation {
    if (magnitude <= 0) {
      return { x: 0, y: 0, z: 0 };
    }

    return {
      x: sample.x / magnitude,
      y: sample.y / magnitude,
      z: sample.z / magnitude,
    };
  }

  private emit<TEvent extends keyof CrashDetectionEventMap>(
    event: TEvent,
    payload: CrashDetectionEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

export const crashDetectionService = new CrashDetectionService();
