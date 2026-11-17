import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { AreasModule } from './areas/areas.module';
import { LogsModule } from './logs/logs.module';
import { LocationsModule } from './locations/locations.module';
import { HealthController } from './health/health.controller';
import { MetricsController } from './telemetry/metrics.controller';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

/** HTTP API process. Guards run in this order: authentication, then rate limiting. */
@Module({
  imports: [CoreModule, AreasModule, LogsModule, LocationsModule],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
