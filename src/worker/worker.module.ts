import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule } from '../core/core.module';
import { HealthController } from '../health/health.controller';
import { MetricsController } from '../telemetry/metrics.controller';
import { LOCATION_QUEUE, MAINTENANCE_QUEUE } from '../queue/queue.constants';
import { TrackingService } from '../tracking/tracking.service';
import { LocationProcessor } from '../tracking/location.processor';
import { RetentionProcessor } from './retention.processor';
import { QueueMetricsService } from './queue-metrics.service';

/**
 * Worker process: consumes the location queue. Scales independently from the API.
 * Exposes only health and metrics over HTTP.
 */
@Module({
  imports: [
    CoreModule,
    BullModule.registerQueue({ name: LOCATION_QUEUE }, { name: MAINTENANCE_QUEUE }),
  ],
  controllers: [HealthController, MetricsController],
  providers: [TrackingService, LocationProcessor, RetentionProcessor, QueueMetricsService],
})
export class WorkerModule {}
