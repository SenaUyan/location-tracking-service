import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

/** Shared Redis connection used for rate limiting and health checks (BullMQ has its own). */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new Redis(config.redis.url, { maxRetriesPerRequest: 2, enableOfflineQueue: false }),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
