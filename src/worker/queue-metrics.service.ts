import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Metrics } from '../telemetry/metrics';
import { LOCATION_QUEUE } from '../queue/queue.constants';

/**
 * Exposes the queue backlog as a gauge. A backlog that keeps growing means the workers
 * cannot keep up → scale out workers. This is the key capacity signal of the system.
 */
@Injectable()
export class QueueMetricsService implements OnModuleInit {
  constructor(@InjectQueue(LOCATION_QUEUE) private readonly queue: Queue) {}

  onModuleInit(): void {
    Metrics.meter
      .createObservableGauge('location_queue_jobs', {
        description: 'Jobs in the location queue by state',
      })
      .addCallback(async (result) => {
        const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        for (const [state, value] of Object.entries(counts)) result.observe(value, { state });
      });
  }
}
