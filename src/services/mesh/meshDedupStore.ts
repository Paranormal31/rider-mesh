import AsyncStorage from '@react-native-async-storage/async-storage';

const DEDUP_STORAGE_KEY = '@dextrix/mesh-dedup/v1';
const MAX_AGE_MS = 10 * 60 * 1000;

class MeshDedupStore {
  private loaded = false;
  private seenByMessageId = new Map<string, number>();

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(DEDUP_STORAGE_KEY);
      if (!raw) {
        this.loaded = true;
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const [messageId, timestamp] of Object.entries(parsed)) {
        if (typeof timestamp === 'number') {
          this.seenByMessageId.set(messageId, timestamp);
        }
      }
    } catch {
      this.seenByMessageId.clear();
    }

    this.cleanup(Date.now());
    this.loaded = true;
  }

  async remember(messageId: string, seenAt: number): Promise<void> {
    await this.load();
    this.seenByMessageId.set(messageId, seenAt);
    this.cleanup(seenAt);
    await this.persist();
  }

  async has(messageId: string, nowMs = Date.now()): Promise<boolean> {
    await this.load();
    this.cleanup(nowMs);
    return this.seenByMessageId.has(messageId);
  }

  private cleanup(nowMs: number): void {
    for (const [messageId, seenAt] of this.seenByMessageId) {
      if (seenAt < nowMs - MAX_AGE_MS) {
        this.seenByMessageId.delete(messageId);
      }
    }
  }

  private async persist(): Promise<void> {
    const serialized: Record<string, number> = {};
    for (const [messageId, seenAt] of this.seenByMessageId) {
      serialized[messageId] = seenAt;
    }

    await AsyncStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify(serialized));
  }
}

export const meshDedupStore = new MeshDedupStore();
