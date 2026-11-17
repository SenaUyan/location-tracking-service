import { metrics } from '@opentelemetry/api';

/**
 * Business metrics. With the SDK started they are exported on /metrics;
 * without it (unit tests) the API returns no-op instruments.
 */
const meter = metrics.getMeter('location-tracking-service');

export const Metrics = {
  locationsReceived: meter.createCounter('locations_received_total', {
    description: 'Locations received by the API, by result (accepted / rejected) and reason',
  }),
  locationsProcessed: meter.createCounter('locations_processed_total', {
    description: 'Locations processed by workers, by outcome (processed / stale)',
  }),
  areaEntriesCreated: meter.createCounter('area_entries_created_total', {
    description: 'Area entry logs written',
  }),
  processingDuration: meter.createHistogram('location_processing_duration_ms', {
    description: 'Time to process one location in the worker (lock + spatial query + writes)',
    unit: 'ms',
  }),
  meter,
};
