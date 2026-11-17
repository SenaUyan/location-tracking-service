/**
 * OpenTelemetry bootstrap. MUST be imported before anything else (first line of main.ts /
 * worker.ts) so auto-instrumentation can patch http, express, pg, ioredis and pino.
 *
 * - Traces: exported via OTLP/HTTP only when OTEL_EXPORTER_OTLP_ENDPOINT is set (e.g. Jaeger).
 * - Metrics: always collected, exposed in Prometheus format on GET /metrics.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const role = process.env.OTEL_ROLE ?? 'api';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

export const prometheusExporter = new PrometheusExporter({ preventServerStart: true });

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: `${process.env.OTEL_SERVICE_NAME ?? 'location-tracking-service'}-${role}`,
  }),
  traceExporter: otlpEndpoint
    ? new OTLPTraceExporter({ url: `${otlpEndpoint.replace(/\/$/, '')}/v1/traces` })
    : undefined,
  metricReaders: [prometheusExporter],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

if (process.env.NODE_ENV !== 'test') {
  sdk.start();
  const shutdown = () => void sdk.shutdown().catch(() => undefined);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
