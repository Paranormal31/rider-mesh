import AsyncStorage from '@react-native-async-storage/async-storage';

type HazardType = 'POTHOLE' | 'CONSTRUCTION' | 'WATERLOGGING' | 'ACCIDENT_ZONE';

type HazardRecord = {
  id: string;
  type: HazardType;
  latitude: number;
  longitude: number;
  createdAt: number;
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

    try {
      const raw = await AsyncStorage.getItem(HAZARDS_STORAGE_KEY);
      if (!raw) {
        this.loaded = true;
        return;
      }

      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.hazards = parsed.filter(isHazardRecord);
      }
    } catch {
      this.hazards = [];
    } finally {
      this.loaded = true;
    }
  }

  async listHazards(): Promise<HazardRecord[]> {
    await this.load();
    return [...this.hazards].sort((a, b) => b.createdAt - a.createdAt);
  }

  async addHazard(input: AddHazardInput): Promise<HazardRecord> {
    await this.load();
    const hazard: HazardRecord = {
      id: createHazardId(),
      type: input.type,
      latitude: input.latitude,
      longitude: input.longitude,
      createdAt: Date.now(),
    };
    this.hazards = [hazard, ...this.hazards];
    await this.persist();
    this.emit('HAZARD_ADDED', { type: 'HAZARD_ADDED', hazard });
    return hazard;
  }

  async removeHazard(id: string): Promise<void> {
    await this.load();
    this.hazards = this.hazards.filter((hazard) => hazard.id !== id);
    await this.persist();
    this.emit('HAZARD_REMOVED', { type: 'HAZARD_REMOVED', id });
  }

  on<TEvent extends keyof HazardEventMap>(event: TEvent, listener: HazardListener<TEvent>): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
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

function createHazardId(): string {
  return `hazard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    typeof candidate.createdAt === 'number'
  );
}

export const hazardService = new HazardService();
export type { AddHazardInput, HazardRecord, HazardType };
