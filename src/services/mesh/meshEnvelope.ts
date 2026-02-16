import { meshCryptoService } from './meshCrypto';

type MeshEnvelopeType = 'SOS_TRIGGERED' | 'SOS_CANCELLED' | 'SOS_ASSIGNED';

type MeshEnvelopeV1 = {
  version: 1;
  messageId: string;
  originDeviceId: string;
  originPublicKey: string;
  type: MeshEnvelopeType;
  createdAt: number;
  hop: number;
  maxHops: number;
  payload: Record<string, unknown>;
  signature: string;
};

type CreateEnvelopeInput = {
  messageId: string;
  originDeviceId: string;
  originPublicKey: string;
  type: MeshEnvelopeType;
  createdAt: number;
  hop: number;
  maxHops: number;
  payload: Record<string, unknown>;
};

type ParseEnvelopeResult =
  | { ok: true; envelope: MeshEnvelopeV1 }
  | { ok: false; reason: string };

const MAX_AGE_MS = 120_000;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
    .join(',')}}`;
}

function envelopeWithoutSignature(envelope: Omit<MeshEnvelopeV1, 'signature'>): string {
  return canonicalize(envelope);
}

async function createEnvelope(input: CreateEnvelopeInput): Promise<MeshEnvelopeV1> {
  const unsignedEnvelope: Omit<MeshEnvelopeV1, 'signature'> = {
    version: 1,
    messageId: input.messageId,
    originDeviceId: input.originDeviceId,
    originPublicKey: input.originPublicKey,
    type: input.type,
    createdAt: input.createdAt,
    hop: input.hop,
    maxHops: input.maxHops,
    payload: input.payload,
  };

  const signature = await meshCryptoService.sign(envelopeWithoutSignature(unsignedEnvelope));
  return {
    ...unsignedEnvelope,
    signature,
  };
}

function parseEnvelope(raw: string, nowMs = Date.now()): ParseEnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Invalid JSON payload' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'Envelope must be an object' };
  }

  const candidate = parsed as Partial<MeshEnvelopeV1>;
  if (
    candidate.version !== 1 ||
    typeof candidate.messageId !== 'string' ||
    typeof candidate.originDeviceId !== 'string' ||
    typeof candidate.originPublicKey !== 'string' ||
    (candidate.type !== 'SOS_TRIGGERED' && candidate.type !== 'SOS_CANCELLED' && candidate.type !== 'SOS_ASSIGNED') ||
    typeof candidate.createdAt !== 'number' ||
    typeof candidate.hop !== 'number' ||
    typeof candidate.maxHops !== 'number' ||
    !candidate.payload ||
    typeof candidate.payload !== 'object' ||
    typeof candidate.signature !== 'string'
  ) {
    return { ok: false, reason: 'Invalid envelope fields' };
  }

  if (candidate.createdAt < nowMs - MAX_AGE_MS) {
    return { ok: false, reason: 'Expired envelope' };
  }

  if (candidate.hop < 0 || candidate.maxHops < 0 || candidate.hop > candidate.maxHops) {
    return { ok: false, reason: 'Invalid hop values' };
  }

  const unsignedEnvelope: Omit<MeshEnvelopeV1, 'signature'> = {
    version: 1,
    messageId: candidate.messageId,
    originDeviceId: candidate.originDeviceId,
    originPublicKey: candidate.originPublicKey,
    type: candidate.type,
    createdAt: candidate.createdAt,
    hop: candidate.hop,
    maxHops: candidate.maxHops,
    payload: candidate.payload as Record<string, unknown>,
  };

  const verified = meshCryptoService.verify(
    envelopeWithoutSignature(unsignedEnvelope),
    candidate.signature,
    candidate.originPublicKey
  );

  if (!verified) {
    return { ok: false, reason: 'Invalid signature' };
  }

  return {
    ok: true,
    envelope: {
      ...unsignedEnvelope,
      signature: candidate.signature,
    },
  };
}

function serializeEnvelope(envelope: MeshEnvelopeV1): string {
  return JSON.stringify(envelope);
}

export { createEnvelope, parseEnvelope, serializeEnvelope };
export type { MeshEnvelopeType, MeshEnvelopeV1 };
