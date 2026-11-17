// Imported before instrumentation in worker.ts so traces/metrics are tagged as the worker.
process.env.OTEL_ROLE = process.env.OTEL_ROLE ?? 'worker';
