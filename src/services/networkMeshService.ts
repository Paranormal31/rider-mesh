import AsyncStorage from '@react-native-async-storage/async-storage';

type NetworkMeshStatus = 'INTERNET' | 'MESH_ONLY' | 'OFFLINE';

type NetworkMeshEventMap = {
  STATUS_CHANGED: { type: 'STATUS_CHANGED'; status: NetworkMeshStatus; changedAt: number };
};

type NetworkMeshListener<TEvent extends keyof NetworkMeshEventMap> = (
  payload: NetworkMeshEventMap[TEvent]
) => void;

const NETWORK_STATUS_KEY = '@dextrix/network-mesh-status/v1';

class NetworkMeshService {
  private status: NetworkMeshStatus = 'INTERNET';
  private loaded = false;
  private listeners: {
    [K in keyof NetworkMeshEventMap]: Set<NetworkMeshListener<K>>;
  } = {
    STATUS_CHANGED: new Set(),
  };

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(NETWORK_STATUS_KEY);
      if (raw === 'INTERNET' || raw === 'MESH_ONLY' || raw === 'OFFLINE') {
        this.status = raw;
      }
    } catch {
      this.status = 'INTERNET';
    } finally {
      this.loaded = true;
    }
  }

  getStatus(): NetworkMeshStatus {
    return this.status;
  }

  async setStatus(status: NetworkMeshStatus): Promise<void> {
    await this.load();
    this.status = status;
    await AsyncStorage.setItem(NETWORK_STATUS_KEY, status);
    this.emit('STATUS_CHANGED', {
      type: 'STATUS_CHANGED',
      status,
      changedAt: Date.now(),
    });
  }

  on<TEvent extends keyof NetworkMeshEventMap>(
    event: TEvent,
    listener: NetworkMeshListener<TEvent>
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private emit<TEvent extends keyof NetworkMeshEventMap>(
    event: TEvent,
    payload: NetworkMeshEventMap[TEvent]
  ): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

export const networkMeshService = new NetworkMeshService();
export type { NetworkMeshStatus };
