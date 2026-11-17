import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { Metrics } from '../telemetry/metrics';
import { LOCATION_QUEUE, LocationJobData } from '../queue/queue.constants';
import { ProcessResult, TrackingService } from './tracking.service';

const tracer = trace.getTracer('location-tracking-service');

@Processor(LOCATION_QUEUE)
export class LocationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(LocationProcessor.name);

  constructor(
    private readonly tracking: TrackingService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  onModuleInit(): void {
    this.worker.concurrency = this.config.worker.concurrency;
  }

  async process(job: Job<LocationJobData>): Promise<ProcessResult> {
    // Continue the trace started by the API request that enqueued this job.
    const parent = propagation.extract(context.active(), job.data.trace ?? {});

    return tracer.startActiveSpan(
      'location.process',
      {
        kind: SpanKind.CONSUMER,
        attributes: { 'user.id': job.data.userId, 'job.attempt': job.attemptsMade + 1 },
      },
      parent,
      async (span) => {
        const started = performance.now();
        try {
          const result = await this.tracking.process({
            userId: job.data.userId,
            latitude: job.data.latitude,
            longitude: job.data.longitude,
            timestamp: new Date(job.data.timestamp),
          });
          span.setAttribute('location.outcome', result.outcome);
          if (result.outcome === 'processed') {
            span.setAttribute('area.entries', result.enteredAreaIds.length);
          }
          return result;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          this.logger.warn(
            { err, jobId: job.id, attempt: job.attemptsMade + 1 },
            'Location processing failed, BullMQ will retry',
          );
          throw err;
        } finally {
          Metrics.processingDuration.record(performance.now() - started);
          span.end();
        }
      },
    );
  }
}
