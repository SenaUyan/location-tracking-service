import * as Joi from 'joi';

/**
 * Every environment variable the service reads is declared and validated here.
 * The process refuses to start with a clear message if something is missing or malformed,
 * instead of failing later at runtime.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  PORT: Joi.number().port().default(3000),
  WORKER_PORT: Joi.number().port().default(3001),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_POOL_SIZE: Joi.number().integer().min(1).default(20),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  API_KEY_ADMIN: Joi.string().min(16).required(),
  API_KEY_INGEST: Joi.string().min(16).required(),

  // Area entry detection
  STATE_TTL_SECONDS: Joi.number().integer().min(1).default(1800),
  EXIT_BUFFER_METERS: Joi.number().min(0).default(10),

  // Location validation
  MAX_FUTURE_SKEW_SECONDS: Joi.number().integer().min(0).default(300),
  MAX_LOCATION_AGE_SECONDS: Joi.number().integer().min(1).default(86400),

  // Areas
  POLYGON_MAX_VERTICES: Joi.number().integer().min(4).default(1000),

  // Rate limiting
  RATE_LIMIT_LOCATIONS_PER_MINUTE: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_ADMIN_PER_MINUTE: Joi.number().integer().min(1).default(600),

  // Worker
  WORKER_CONCURRENCY: Joi.number().integer().min(1).default(20),

  // Data retention (0 = disabled)
  LOG_RETENTION_DAYS: Joi.number().integer().min(0).default(0),
  RETENTION_BATCH_SIZE: Joi.number().integer().min(1).default(5000),
  RETENTION_CRON: Joi.string().default('0 3 * * *'),

  // Observability
  OTEL_SERVICE_NAME: Joi.string().default('location-tracking-service'),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().allow('').optional(),
});
