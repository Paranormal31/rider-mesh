import AsyncStorage from '@react-native-async-storage/async-storage';

import { HAZARDS_API_URL } from '@/src/config/api';

import { socketService } from './socketService';

type HazardType = 'POTHOLE' | 'CONSTRUCTION' | 'WATERLOGGING' | 'ACCIDENT_ZONE';

type HazardRecord = {
  id: string;
  type: HazardType;
  latitude: number;
  longitude: number;
  createdAt: number;
  updatedAt: number;
};

type AddHazardInput = {
  type: HazardType;
  latitude: number;
  longitude: number;
};

type HazardEventMap = {
  HAZARD_ADDED: { type: 'HAZARD_ADDED'; hazard: HazardRecord };
  HAZARD_REMOVED: { type: 'HAZARD_REMOVED'; id: string };
};

type HazardListener<TEvent extends keyof HazardEventMap> = (payload: HazardEventMap[TEvent]) => void;

const HAZARDS_STORAGE_KEY = '@dextrix/hazards/v1';

class HazardService {
  private hazards: HazardRecord[] = [];
  private loaded = false;
  private started = false;
  private offHazardCreated: (() => void) | null = null;
  private offHazardRemoved: (() => void) | null = null;
  private listeners: {
    [K in keyof HazardEventMap]: Set<HazardListener<K>>;
  } = {
    HAZARD_ADDED: new Set(),
    HAZARD_REMOVED: new Set(),
  };

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await this.startRealtimeSync();

    try {
      const raw = await AsyncStorage.getItem(HAZARDS_STORAGE_KEY);
      if (!raw) {
        this.hazards = [];
      } else {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.hazards = parsed.filter(isHazardRecord);
        }
      }
    } catch {
      this.hazards = [];
    }

    await this.refreshFromBackend();
    this.loaded = true;
  }

  async listHazards(): Promise<HazardRecord[]> {
    await this.load();
    await this.refreshFromBackend();
    return [...this.hazards].sort((a, b) => b.createdAt - a.createdAt);
  }

  async addHazard(input: AddHazardInput): Promise<HazardRecord> {
    await this.load();
    const response = await fetch(HAZARDS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Failed to create hazard (status ${response.status})`);
    }

    const payload: unknown = await response.json();
    const created = isSingleHazardEnvelope(payload) ? payload.data : null;
    if (!created) {
      throw new Error('Invalid hazard create response');
    }
    this.applyHazardCreated(created, { emit: true });
    return created;
  }

  async removeHazard(id: string): Promise<void> {
    await this.load();
    const response = await fetch(`${HAZARDS_API_URL}/${id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to remove hazard (status ${response.status})`);
    }

    this.applyHazardRemoved(id, { emit: true });
  }

  on<TEvent extends keyof HazardEventMap>(event: TEvent, listener: HazardListener<TEvent>): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private async startRealtimeSync(): Promise<void> {
    if (this.started) {
      return;
    }

    await socketService.start();
    this.offHazardCreated = socketService.on('hazard:created', (hazard) => {
      this.applyHazardCreated(hazard, { emit: true });
    });
    this.offHazardRemoved = socketService.on('hazard:removed', ({ id }) => {
      this.applyHazardRemoved(id, { emit: true });
    });
    this.started = true;
  }

  private async refreshFromBackend(): Promise<void> {
    try {
      const response = await fetch(HAZARDS_API_URL);
      if (!response.ok) {
        return;
      }

      const payload: unknown = await response.json();
      if (!isHazardsEnvelope(payload) || !Array.isArray(payload.data)) {
        return;
      }

      this.hazards = payload.data;
      await this.persist();
    } catch {
      // Keep existing cached hazards on transient network failures.
    }
  }

  private applyHazardCreated(
    hazard: HazardRecord,
    options: {
      emit: boolean;
    }
  ): void {
    const existingIndex = this.hazards.findIndex((item) => item.id === hazard.id);
    if (existingIndex === -1) {
      this.hazards = [hazard, ...this.hazards];
    } else {
      const next = [...this.hazards];
      next[existingIndex] = hazard;
      this.hazards = next;
    }
    void this.persist();
    if (options.emit) {
      this.emit('HAZARD_ADDED', { type: 'HAZARD_ADDED', hazard });
    }
  }

  private applyHazardRemoved(
    id: string,
    options: {
      emit: boolean;
    }
  ): void {
    const next = this.hazards.filter((hazard) => hazard.id !== id);
    if (next.length === this.hazards.length) {
      return;
    }
    this.hazards = next;
    void this.persist();
    if (options.emit) {
      this.emit('HAZARD_REMOVED', { type: 'HAZARD_REMOVED', id });
    }
  }

  private async persist(): Promise<void> {
    await AsyncStorage.setItem(HAZARDS_STORAGE_KEY, JSON.stringify(this.hazards));
  }

  private emit<TEvent extends keyof HazardEventMap>(
    event: TEvent,
    payload: HazardEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

function isHazardRecord(value: unknown): value is HazardRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<HazardRecord>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.type === 'POTHOLE' ||
      candidate.type === 'CONSTRUCTION' ||
      candidate.type === 'WATERLOGGING' ||
      candidate.type === 'ACCIDENT_ZONE') &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  );
}

function isSingleHazardEnvelope(value: unknown): value is { data: HazardRecord } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { data?: unknown };
  return isHazardRecord(candidate.data);
}

function isHazardsEnvelope(value: unknown): value is { data: HazardRecord[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { data?: unknown };
  return Array.isArray(candidate.data) && candidate.data.every((item) => isHazardRecord(item));
}

export const hazardService = new HazardService();
export type { AddHazardInput, HazardRecord, HazardType };
