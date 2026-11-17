import { ConfigService } from '@nestjs/config';

/**
 * Typed view over the validated environment, so the rest of the code never reads raw strings.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: string;
  port: number;
  workerPort: number;
  database: { url: string; poolSize: number };
  redis: { url: string };
  apiKeys: { admin: string; ingest: string };
  tracking: { stateTtlSeconds: number; exitBufferMeters: number };
  locations: { maxFutureSkewSeconds: number; maxLocationAgeSeconds: number };
  areas: { polygonMaxVertices: number };
  rateLimit: { locationsPerMinute: number; adminPerMinute: number };
  worker: { concurrency: number };
  retention: { logRetentionDays: number; batchSize: number; cron: string };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function buildAppConfig(config: ConfigService): AppConfig {
  const num = (key: string) => Number(config.getOrThrow(key));
  return {
    nodeEnv: config.getOrThrow('NODE_ENV'),
    logLevel: config.getOrThrow('LOG_LEVEL'),
    port: num('PORT'),
    workerPort: num('WORKER_PORT'),
    database: { url: config.getOrThrow('DATABASE_URL'), poolSize: num('DATABASE_POOL_SIZE') },
    redis: { url: config.getOrThrow('REDIS_URL') },
    apiKeys: {
      admin: config.getOrThrow('API_KEY_ADMIN'),
      ingest: config.getOrThrow('API_KEY_INGEST'),
    },
    tracking: {
      stateTtlSeconds: num('STATE_TTL_SECONDS'),
      exitBufferMeters: num('EXIT_BUFFER_METERS'),
    },
    locations: {
      maxFutureSkewSeconds: num('MAX_FUTURE_SKEW_SECONDS'),
      maxLocationAgeSeconds: num('MAX_LOCATION_AGE_SECONDS'),
    },
    areas: { polygonMaxVertices: num('POLYGON_MAX_VERTICES') },
    rateLimit: {
      locationsPerMinute: num('RATE_LIMIT_LOCATIONS_PER_MINUTE'),
      adminPerMinute: num('RATE_LIMIT_ADMIN_PER_MINUTE'),
    },
    worker: { concurrency: num('WORKER_CONCURRENCY') },
    retention: {
      logRetentionDays: num('LOG_RETENTION_DAYS'),
      batchSize: num('RETENTION_BATCH_SIZE'),
      cron: config.getOrThrow('RETENTION_CRON'),
    },
  };
}
