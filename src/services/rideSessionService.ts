import AsyncStorage from '@react-native-async-storage/async-storage';

type RideSessionState = 'IDLE' | 'ACTIVE' | 'ENDED';

type RideSession = {
  id: string;
  state: RideSessionState;
  startedAt: number | null;
  endedAt: number | null;
};

type RideSummary = {
  id: string;
  sessionId: string;
  durationMs: number;
  distanceKm: number;
  fatigueWarnings: number;
  hazardsReported: number;
  sosTriggered: number;
  createdAt: number;
};

type RideSessionEventMap = {
  RIDE_STARTED: { type: 'RIDE_STARTED'; session: RideSession };
  RIDE_ENDED: { type: 'RIDE_ENDED'; session: RideSession; summary: RideSummary };
  RIDE_TICK: { type: 'RIDE_TICK'; elapsedMs: number };
};

type RideSessionListener<TEvent extends keyof RideSessionEventMap> = (
  payload: RideSessionEventMap[TEvent]
) => void;

const CURRENT_SESSION_KEY = '@dextrix/ride-session/current/v1';
const SUMMARIES_KEY = '@dextrix/ride-session/summaries/v1';
const MAX_SUMMARIES = 50;

class RideSessionService {
  private currentSession: RideSession = {
    id: '',
    state: 'IDLE',
    startedAt: null,
    endedAt: null,
  };
  private summaries: RideSummary[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private loaded = false;
  private listeners: {
    [K in keyof RideSessionEventMap]: Set<RideSessionListener<K>>;
  } = {
    RIDE_STARTED: new Set(),
    RIDE_ENDED: new Set(),
    RIDE_TICK: new Set(),
  };

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const [currentRaw, summariesRaw] = await Promise.all([
        AsyncStorage.getItem(CURRENT_SESSION_KEY),
        AsyncStorage.getItem(SUMMARIES_KEY),
      ]);

      if (currentRaw) {
        const parsedCurrent: unknown = JSON.parse(currentRaw);
        if (isRideSession(parsedCurrent)) {
          this.currentSession = parsedCurrent;
        }
      }

      if (summariesRaw) {
        const parsedSummaries: unknown = JSON.parse(summariesRaw);
        if (Array.isArray(parsedSummaries)) {
          this.summaries = parsedSummaries.filter(isRideSummary);
        }
      }
    } catch {
      this.currentSession = { id: '', state: 'IDLE', startedAt: null, endedAt: null };
      this.summaries = [];
    } finally {
      this.loaded = true;
      this.syncTickTimer();
    }
  }

  getCurrentSession(): RideSession {
    return { ...this.currentSession };
  }

  getSummaries(): RideSummary[] {
    return [...this.summaries];
  }

  getElapsedMs(): number {
    if (this.currentSession.state !== 'ACTIVE' || !this.currentSession.startedAt) {
      return 0;
    }
    return Math.max(0, Date.now() - this.currentSession.startedAt);
  }

  async startRide(): Promise<RideSession> {
    await this.load();
    if (this.currentSession.state === 'ACTIVE') {
      return this.getCurrentSession();
    }

    const session: RideSession = {
      id: createId('ride'),
      state: 'ACTIVE',
      startedAt: Date.now(),
      endedAt: null,
    };
    this.currentSession = session;
    await this.persistCurrentSession();
    this.syncTickTimer();
    this.emit('RIDE_STARTED', { type: 'RIDE_STARTED', session: this.getCurrentSession() });
    return this.getCurrentSession();
  }

  async endRide(): Promise<RideSummary | null> {
    await this.load();
    if (this.currentSession.state !== 'ACTIVE' || !this.currentSession.startedAt) {
      return null;
    }

    const endedAt = Date.now();
    const session: RideSession = {
      ...this.currentSession,
      state: 'ENDED',
      endedAt,
    };
    this.currentSession = session;

    const summary: RideSummary = {
      id: createId('summary'),
      sessionId: session.id,
      durationMs: Math.max(0, endedAt - session.startedAt),
      distanceKm: 0,
      fatigueWarnings: 0,
      hazardsReported: 0,
      sosTriggered: 0,
      createdAt: endedAt,
    };

    this.summaries = [summary, ...this.summaries].slice(0, MAX_SUMMARIES);
    await Promise.all([this.persistCurrentSession(), this.persistSummaries()]);
    this.syncTickTimer();
    this.emit('RIDE_ENDED', { type: 'RIDE_ENDED', session: this.getCurrentSession(), summary });
    return summary;
  }

  on<TEvent extends keyof RideSessionEventMap>(
    event: TEvent,
    listener: RideSessionListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private syncTickTimer(): void {
    const shouldTick = this.currentSession.state === 'ACTIVE' && !!this.currentSession.startedAt;
    if (!shouldTick) {
      if (this.tickTimer) {
        clearInterval(this.tickTimer);
        this.tickTimer = null;
      }
      return;
    }

    if (this.tickTimer) {
      return;
    }

    this.tickTimer = setInterval(() => {
      this.emit('RIDE_TICK', { type: 'RIDE_TICK', elapsedMs: this.getElapsedMs() });
    }, 1000);
  }

  private async persistCurrentSession(): Promise<void> {
    await AsyncStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(this.currentSession));
  }

  private async persistSummaries(): Promise<void> {
    await AsyncStorage.setItem(SUMMARIES_KEY, JSON.stringify(this.summaries));
  }

  private emit<TEvent extends keyof RideSessionEventMap>(
    event: TEvent,
    payload: RideSessionEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRideSession(value: unknown): value is RideSession {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RideSession>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.state === 'IDLE' || candidate.state === 'ACTIVE' || candidate.state === 'ENDED') &&
    (typeof candidate.startedAt === 'number' || candidate.startedAt === null) &&
    (typeof candidate.endedAt === 'number' || candidate.endedAt === null)
  );
}

function isRideSummary(value: unknown): value is RideSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RideSummary>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.durationMs === 'number' &&
    typeof candidate.distanceKm === 'number' &&
    typeof candidate.fatigueWarnings === 'number' &&
    typeof candidate.hazardsReported === 'number' &&
    typeof candidate.sosTriggered === 'number' &&
    typeof candidate.createdAt === 'number'
  );
}

export const rideSessionService = new RideSessionService();
export type { RideSession, RideSessionState, RideSummary };
