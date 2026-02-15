import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PORT = 4000;
const DEFAULT_NODE_ENV = 'development';
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
];

type NodeEnv = 'development' | 'test' | 'production';

export interface EnvConfig {
  nodeEnv: NodeEnv;
  port: number;
  mongodbUri: string;
  corsOrigins: string[];
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  const input = (value ?? DEFAULT_NODE_ENV).trim();
  if (input === 'development' || input === 'test' || input === 'production') {
    return input;
  }

  throw new Error(`Invalid NODE_ENV: ${value}. Expected development, test, or production.`);
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${value}. Expected an integer between 1 and 65535.`);
  }

  return parsed;
}

function parseMongoUri(value: string | undefined): string {
  const uri = value?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is required.');
  }

  if (!(uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'))) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  return uri;
}

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return DEFAULT_CORS_ORIGINS;
  }

  const parsed = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one comma-separated origin.');
  }

  return parsed;
}

export function loadEnv(): EnvConfig {
  return {
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
    port: parsePort(process.env.PORT),
    mongodbUri: parseMongoUri(process.env.MONGODB_URI),
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  };
}
