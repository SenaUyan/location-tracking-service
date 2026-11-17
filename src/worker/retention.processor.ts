import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import {
  MAINTENANCE_QUEUE,
  PURGE_OLD_ENTRIES_JOB,
  RETENTION_SCHEDULER_ID,
} from '../queue/queue.constants';

/**
 * Deletes area entries older than LOG_RETENTION_DAYS (personal data must not be kept longer
 * than needed – KVKK / GDPR). Disabled by default (0): the retention period is a business /
 * legal decision. Deletes in small batches so the table is never locked for long.
 * The schedule lives in Redis, so it runs once per tick even with many worker replicas.
 */
@Processor(MAINTENANCE_QUEUE)
export class RetentionProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const { logRetentionDays, cron } = this.config.retention;
    if (logRetentionDays > 0) {
      await this.queue.upsertJobScheduler(
        RETENTION_SCHEDULER_ID,
        { pattern: cron },
        { name: PURGE_OLD_ENTRIES_JOB },
      );
      this.logger.log(`Log retention enabled: ${logRetentionDays} days, schedule "${cron}"`);
    } else {
      await this.queue.removeJobScheduler(RETENTION_SCHEDULER_ID);
      this.logger.log('Log retention disabled (LOG_RETENTION_DAYS=0)');
    }
  }

  async process(): Promise<{ deleted: number }> {
    return { deleted: await this.purge(new Date()) };
  }

  async purge(now: Date): Promise<number> {
    const { logRetentionDays, batchSize } = this.config.retention;
    if (logRetentionDays <= 0) return 0;

    const cutoff = new Date(now.getTime() - logRetentionDays * 86_400_000);
    let total = 0;
    for (;;) {
      const [{ n }] = (await this.dataSource.query(
        `WITH doomed AS (
           SELECT id FROM area_entries WHERE entered_at < $1 ORDER BY entered_at LIMIT $2
         ), d AS (
           DELETE FROM area_entries e USING doomed WHERE e.id = doomed.id RETURNING 1
         )
         SELECT count(*)::int AS n FROM d`,
        [cutoff, batchSize],
      )) as { n: number }[];
      total += n;
      if (n < batchSize) break;
    }
    this.logger.log({ deleted: total, cutoff }, 'Old area entries purged');
    return total;
  }
}
