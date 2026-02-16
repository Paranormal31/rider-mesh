import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';

const KEYPAIR_STORAGE_KEY = '@dextrix/mesh-keypair/v1';

type MeshKeyPair = {
  publicKey: string;
  secretKey: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  const bufferModule = getBufferModule();
  if (bufferModule) {
    return bufferModule.from(bytes).toString('base64');
  }

  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }

  throw new Error('No base64 encoder available.');
}

function base64ToBytes(value: string): Uint8Array {
  const bufferModule = getBufferModule();
  if (bufferModule) {
    return new Uint8Array(bufferModule.from(value, 'base64'));
  }

  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error('No base64 decoder available.');
}

function getBufferModule(): { from(value: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding?: string): string } } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const value = require('buffer') as { Buffer?: { from: (value: string | Uint8Array, encoding?: string) => Uint8Array & { toString(encoding?: string): string } } };
    return value.Buffer ?? null;
  } catch {
    return null;
  }
}

class MeshCryptoService {
  private keyPair: MeshKeyPair | null = null;

  async getOrCreateKeyPair(): Promise<MeshKeyPair> {
    if (this.keyPair) {
      return this.keyPair;
    }

    try {
      const stored = await AsyncStorage.getItem(KEYPAIR_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<MeshKeyPair>;
        if (typeof parsed.publicKey === 'string' && typeof parsed.secretKey === 'string') {
          this.keyPair = {
            publicKey: parsed.publicKey,
            secretKey: parsed.secretKey,
          };
          return this.keyPair;
        }
      }
    } catch {
      // Ignore malformed key material and generate a new keypair.
    }

    const created = nacl.sign.keyPair();
    this.keyPair = {
      publicKey: bytesToBase64(created.publicKey),
      secretKey: bytesToBase64(created.secretKey),
    };
    await AsyncStorage.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(this.keyPair));
    return this.keyPair;
  }

  async sign(payload: string): Promise<string> {
    const keys = await this.getOrCreateKeyPair();
    const encoder = new TextEncoder();
    const signature = nacl.sign.detached(encoder.encode(payload), base64ToBytes(keys.secretKey));
    return bytesToBase64(signature);
  }

  verify(payload: string, signatureBase64: string, publicKeyBase64: string): boolean {
    const encoder = new TextEncoder();
    try {
      return nacl.sign.detached.verify(
        encoder.encode(payload),
        base64ToBytes(signatureBase64),
        base64ToBytes(publicKeyBase64)
      );
    } catch {
      return false;
    }
  }
}

export const meshCryptoService = new MeshCryptoService();
export type { MeshKeyPair };
