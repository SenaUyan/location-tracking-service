import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { Metrics } from '../telemetry/metrics';
import { AreaProximity, decideEntries, isStale } from './entry-detection';

export interface LocationInput {
  userId: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export type ProcessResult =
  | { outcome: 'stale' }
  | { outcome: 'processed'; enteredAreaIds: string[]; currentAreaIds: string[] };

/**
 * Applies one location to the user's state inside a single transaction:
 *
 *   BEGIN
 *     lock the user's state row (SELECT ... FOR UPDATE)      ← serializes the same user
 *     stale?  → stop                                         ← out-of-order / duplicates
 *     spatial query: areas covering / near the point         ← GiST indexes
 *     insert entries ON CONFLICT DO NOTHING                  ← DB-level idempotency
 *     update the state row
 *   COMMIT                                                   ← all or nothing
 *
 * Different users never wait for each other; one user's locations are processed one at a time.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  process(input: LocationInput): Promise<ProcessResult> {
    return this.dataSource.transaction(async (tx) => {
      const previous = await this.lockState(tx, input.userId);

      if (isStale(previous, input.timestamp)) {
        Metrics.locationsProcessed.add(1, { outcome: 'stale' });
        return { outcome: 'stale' } as const;
      }

      const proximities = await this.findAreasNear(tx, input.latitude, input.longitude);
      const decision = decideEntries(
        previous,
        input.timestamp,
        proximities,
        this.config.tracking.stateTtlSeconds * 1000,
      );

      if (decision.enteredAreaIds.length > 0) {
        const inserted: unknown[] = await tx.query(
          `INSERT INTO area_entries (user_id, area_id, entered_at, latitude, longitude)
           SELECT $1, area_id, $3, $4, $5 FROM unnest($2::uuid[]) AS area_id
           ON CONFLICT ON CONSTRAINT uq_area_entries_user_area_time DO NOTHING
           RETURNING id`,
          [input.userId, decision.enteredAreaIds, input.timestamp, input.latitude, input.longitude],
        );
        Metrics.areaEntriesCreated.add(inserted.length);
        this.logger.log(
          { userId: input.userId, areaIds: decision.enteredAreaIds, enteredAt: input.timestamp },
          'Area entry recorded',
        );
      }

      await tx.query(
        `UPDATE user_area_states
            SET area_ids = $2::uuid[], last_location_at = $3,
                last_latitude = $4, last_longitude = $5, updated_at = now()
          WHERE user_id = $1`,
        [input.userId, decision.nextAreaIds, input.timestamp, input.latitude, input.longitude],
      );

      Metrics.locationsProcessed.add(1, { outcome: 'processed' });
      return {
        outcome: 'processed',
        enteredAreaIds: decision.enteredAreaIds,
        currentAreaIds: decision.nextAreaIds,
      } as const;
    });
  }

  private async lockState(tx: EntityManager, userId: string) {
    // Make sure a row exists, then lock it. Concurrent jobs of the same user block here.
    await tx.query(`INSERT INTO user_area_states (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
      userId,
    ]);
    const [row] = (await tx.query(
      `SELECT area_ids::text[] AS "areaIds", last_location_at AS "lastLocationAt"
         FROM user_area_states WHERE user_id = $1 FOR UPDATE`,
      [userId],
    )) as { areaIds: string[]; lastLocationAt: Date | null }[];
    return { areaIds: row.areaIds, lastLocationAt: row.lastLocationAt };
  }

  /**
   * Areas the point is inside of (boundary included → ST_Covers) or within the exit buffer of.
   * Both predicates are index-assisted (GiST on geometry and on geometry::geography).
   */
  private async findAreasNear(
    tx: EntityManager,
    latitude: number,
    longitude: number,
  ): Promise<AreaProximity[]> {
    const rows = (await tx.query(
      `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS g)
       SELECT a.id AS "areaId",
              ST_Covers(a.geometry, p.g) AS inside,
              ST_DWithin(a.geometry::geography, p.g::geography, $3) AS "withinExitBuffer"
         FROM areas a, p
        WHERE ST_Covers(a.geometry, p.g)
           OR ST_DWithin(a.geometry::geography, p.g::geography, $3)`,
      [longitude, latitude, this.config.tracking.exitBufferMeters],
    )) as AreaProximity[];
    return rows;
  }
}
