import mongoose from 'mongoose';

import type { DatabaseHealth, DbReadyStateName } from '../types/health';

const READY_STATE_NAME: Record<number, DbReadyStateName> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function mapReadyState(code: number): DbReadyStateName {
  return READY_STATE_NAME[code] ?? 'uninitialized';
}

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function readDbHealth(): DatabaseHealth {
  const readyStateCode = mongoose.connection.readyState;
  const readyState = mapReadyState(readyStateCode);

  return {
    connected: readyStateCode === 1,
    readyStateCode,
    readyState,
    dbName: mongoose.connection.name || undefined,
    host: mongoose.connection.host || undefined,
  };
}
