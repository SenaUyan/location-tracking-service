import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { context, propagation } from '@opentelemetry/api';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Metrics } from '../telemetry/metrics';
import {
  LOCATION_JOB_OPTIONS,
  LOCATION_QUEUE,
  LocationJobData,
  PROCESS_LOCATION_JOB,
  locationJobId,
} from '../queue/queue.constants';
import { CreateLocationDto } from './dto/create-location.dto';

/**
 * Ingestion path: validate cheaply, enqueue, answer fast. All heavy work happens in the worker.
 */
@Injectable()
export class LocationsService {
  constructor(
    @InjectQueue(LOCATION_QUEUE) private readonly queue: Queue<LocationJobData>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async ingest(dto: CreateLocationDto, now = new Date()): Promise<{ status: 'accepted' }> {
    const timestampMs = this.assertAcceptable(dto, now);

    const trace: Record<string, string> = {};
    propagation.inject(context.active(), trace);

    await this.queue.add(
      PROCESS_LOCATION_JOB,
      {
        userId: dto.userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        timestamp: new Date(timestampMs).toISOString(),
        receivedAt: now.toISOString(),
        trace,
      },
      { ...LOCATION_JOB_OPTIONS, jobId: locationJobId(dto.userId, timestampMs) },
    );

    Metrics.locationsReceived.add(1, { result: 'accepted' });
    return { status: 'accepted' };
  }

  /** Business rules that need more than the DTO shape. Returns the parsed timestamp (ms). */
  private assertAcceptable(dto: CreateLocationDto, now: Date): number {
    const reject = (code: ErrorCode, message: string, extra: Record<string, unknown> = {}) => {
      Metrics.locationsReceived.add(1, { result: 'rejected', reason: code });
      return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, extra);
    };

    // (0,0) "Null Island": the classic value of a failed GPS fix, not a real position.
    if (dto.latitude === 0 && dto.longitude === 0) {
      throw reject(ErrorCode.INVALID_COORDINATES, 'Coordinates (0, 0) indicate a failed GPS fix');
    }

    const ts = Date.parse(dto.timestamp);
    const serverTime = now.toISOString();
    const { maxFutureSkewSeconds, maxLocationAgeSeconds } = this.config.locations;

    // A future timestamp would become the user's "last processed" time and make every
    // following (correct) location look stale – so it must never enter the pipeline.
    if (ts - now.getTime() > maxFutureSkewSeconds * 1000) {
      throw reject(
        ErrorCode.TIMESTAMP_IN_FUTURE,
        'Location timestamp is ahead of server time. The device clock is probably wrong.',
        { serverTime },
      );
    }
    if (now.getTime() - ts > maxLocationAgeSeconds * 1000) {
      throw reject(
        ErrorCode.TIMESTAMP_TOO_OLD,
        `Location timestamp is older than ${maxLocationAgeSeconds} seconds.`,
        { serverTime },
      );
    }
    return ts;
  }
}
