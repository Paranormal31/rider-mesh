import AsyncStorage from '@react-native-async-storage/async-storage';

type SosSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

type SosIncident = {
  id: string;
  riderName: string;
  distanceMeters: number;
  severity: SosSeverity;
  latitude: number;
  longitude: number;
  createdAt: number;
  responding: boolean;
};

type SosSimulationEventMap = {
  INCIDENTS_CHANGED: { type: 'INCIDENTS_CHANGED'; incidents: SosIncident[] };
};

type SosSimulationListener<TEvent extends keyof SosSimulationEventMap> = (
  payload: SosSimulationEventMap[TEvent]
) => void;

const INCIDENTS_KEY = '@dextrix/sos-sim/incidents/v1';

class SosSimulationService {
  private incidents: SosIncident[] = [];
  private loaded = false;
  private listeners: {
    [K in keyof SosSimulationEventMap]: Set<SosSimulationListener<K>>;
  } = {
    INCIDENTS_CHANGED: new Set(),
  };

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(INCIDENTS_KEY);
      if (!raw) {
        this.loaded = true;
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.incidents = parsed.filter(isSosIncident);
      }
    } catch {
      this.incidents = [];
    } finally {
      this.loaded = true;
    }
  }

  async listIncidents(): Promise<SosIncident[]> {
    await this.load();
    return [...this.incidents].sort((a, b) => b.createdAt - a.createdAt);
  }

  async seedDemoIncidents(): Promise<SosIncident[]> {
    await this.load();
    if (this.incidents.length > 0) {
      return this.listIncidents();
    }

    const now = Date.now();
    this.incidents = [
      {
        id: createIncidentId(),
        riderName: 'Rahul S.',
        distanceMeters: 420,
        severity: 'HIGH',
        latitude: 28.6135,
        longitude: 77.2094,
        createdAt: now - 60_000,
        responding: false,
      },
      {
        id: createIncidentId(),
        riderName: 'Priya M.',
        distanceMeters: 880,
        severity: 'MEDIUM',
        latitude: 28.6142,
        longitude: 77.2107,
        createdAt: now - 210_000,
        responding: false,
      },
    ];

    await this.persist();
    this.emitChanged();
    return this.listIncidents();
  }

  async markResponding(id: string): Promise<SosIncident[]> {
    await this.load();
    this.incidents = this.incidents.map((incident) =>
      incident.id === id ? { ...incident, responding: true } : incident
    );
    await this.persist();
    this.emitChanged();
    return this.listIncidents();
  }

  on<TEvent extends keyof SosSimulationEventMap>(
    event: TEvent,
    listener: SosSimulationListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private async persist(): Promise<void> {
    await AsyncStorage.setItem(INCIDENTS_KEY, JSON.stringify(this.incidents));
  }

  private emitChanged(): void {
    const payload: SosSimulationEventMap['INCIDENTS_CHANGED'] = {
      type: 'INCIDENTS_CHANGED',
      incidents: [...this.incidents].sort((a, b) => b.createdAt - a.createdAt),
    };
    for (const listener of this.listeners.INCIDENTS_CHANGED) {
      listener(payload);
    }
  }
}

function createIncidentId(): string {
  return `sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSosIncident(value: unknown): value is SosIncident {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<SosIncident>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.riderName === 'string' &&
    typeof candidate.distanceMeters === 'number' &&
    (candidate.severity === 'LOW' || candidate.severity === 'MEDIUM' || candidate.severity === 'HIGH') &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.responding === 'boolean'
  );
}

export const sosSimulationService = new SosSimulationService();
export type { SosIncident, SosSeverity };
