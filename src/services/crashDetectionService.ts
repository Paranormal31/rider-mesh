import { Accelerometer } from 'expo-sensors';
import type { AccelerometerMeasurement } from 'expo-sensors';

import type { ServiceHealth } from './types';

type SensorSubscription = {
  remove: () => void;
};

export type CrashDetectedEvent = {
  type: 'CRASH_DETECTED';
  timestamp: number;
  totalAcceleration: number;
  threshold: number;
  sample: AccelerometerMeasurement;
};

type CrashDetectionEventMap = {
  CRASH_DETECTED: CrashDetectedEvent;
};

type CrashDetectionListener<TEvent extends keyof CrashDetectionEventMap> = (
  payload: CrashDetectionEventMap[TEvent]
) => void;

export type CrashDetectionConfig = {
  threshold: number;
  cooldownMs: number;
  updateIntervalMs: number;
};

const DEFAULT_CONFIG: CrashDetectionConfig = {
  threshold: 2.5,
  cooldownMs: 4000,
  updateIntervalMs: 100,
};

class CrashDetectionService {
  private running = false;
  private subscription: SensorSubscription | null = null;
  private lockUntilMs = 0;
  private lastCrashTimestampMs: number | null = null;
  private config: CrashDetectionConfig = { ...DEFAULT_CONFIG };
  private listeners: {
    [K in keyof CrashDetectionEventMap]: Set<CrashDetectionListener<K>>;
  } = {
    CRASH_DETECTED: new Set(),
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

  setThreshold(nextThreshold: number): void {
    if (nextThreshold <= 0) {
      throw new Error('Crash threshold must be greater than 0.');
    }

    this.config.threshold = nextThreshold;
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
      detail: this.running ? 'Monitoring accelerometer stream.' : 'Monitoring has not started.',
    };
  }

  private handleSample(sample: AccelerometerMeasurement): void {
    if (!this.running) {
      return;
    }

    const nowMs = Date.now();
    if (nowMs < this.lockUntilMs) {
      return;
    }

    const totalAcceleration = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
    if (totalAcceleration < this.config.threshold) {
      return;
    }

    this.lockUntilMs = nowMs + this.config.cooldownMs;
    this.lastCrashTimestampMs = nowMs;
    this.emit('CRASH_DETECTED', {
      type: 'CRASH_DETECTED',
      timestamp: nowMs,
      totalAcceleration,
      threshold: this.config.threshold,
      sample,
    });
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
