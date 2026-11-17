/** Test environment. Uses its own database and Redis DB index, never the development ones. */
export const TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/location_tracking_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
  API_KEY_ADMIN: 'test-admin-key-0000',
  API_KEY_INGEST: 'test-ingest-key-0000',
  STATE_TTL_SECONDS: '1800',
  EXIT_BUFFER_METERS: '10',
  RATE_LIMIT_LOCATIONS_PER_MINUTE: '1000',
  WORKER_CONCURRENCY: '10',
  LOG_RETENTION_DAYS: '0',
};
Object.assign(process.env, TEST_ENV);
