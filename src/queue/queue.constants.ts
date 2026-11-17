import type { JobsOptions } from 'bullmq';

export const LOCATION_QUEUE = 'locations';
export const MAINTENANCE_QUEUE = 'maintenance';

export const PROCESS_LOCATION_JOB = 'process-location';
export const PURGE_OLD_ENTRIES_JOB = 'purge-old-entries';
export const RETENTION_SCHEDULER_ID = 'log-retention';

/** Payload of a location job. Timestamps travel as ISO strings (JSON). */
export interface LocationJobData {
  userId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  receivedAt: string;
  /** W3C trace context, so the trace continues from the API request into the worker. */
  trace?: Record<string, string>;
}

export const LOCATION_JOB_OPTIONS: JobsOptions = {
  // Transient failures (DB failover, deadlock...) are retried with backoff instead of losing data.
  attempts: 5,
  backoff: { type: 'exponential', delay: 500 },
  removeOnComplete: { age: 300, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * Deterministic job id: a client retry of the same (user, timestamp) while the first job is
 * still in the queue is deduplicated by BullMQ for free. Correctness does not depend on it –
 * the worker and the DB unique constraint guarantee idempotency anyway.
 */
export function locationJobId(userId: string, timestampMs: number): string {
  return `loc_${userId}_${timestampMs}`;
}
