import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor';
import { AreaEntry } from './area-entry.entity';
import { ListLogsQuery } from './dto/list-logs.query';

export interface AreaEntryView {
  id: string;
  userId: string;
  areaId: string;
  areaName: string;
  enteredAt: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class LogsService {
  constructor(@InjectRepository(AreaEntry) private readonly entries: Repository<AreaEntry>) {}

  /**
   * Keyset (cursor) pagination, newest first. Unlike OFFSET it costs the same on page 1 and
   * page 100 000, and rows inserted while paging never shift/duplicate results.
   */
  async list(query: ListLogsQuery): Promise<{ items: AreaEntryView[]; nextCursor: string | null }> {
    const qb = this.entries
      .createQueryBuilder('e')
      .innerJoin('e.area', 'a')
      .select([
        'e.id AS "id"',
        'e.user_id AS "userId"',
        'e.area_id AS "areaId"',
        'a.name AS "areaName"',
        'e.entered_at AS "enteredAt"',
        'e.latitude AS "latitude"',
        'e.longitude AS "longitude"',
      ])
      .orderBy('e.entered_at', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .limit(query.limit + 1);

    if (query.userId) qb.andWhere('e.user_id = :userId', { userId: query.userId });
    if (query.areaId) qb.andWhere('e.area_id = :areaId', { areaId: query.areaId });
    if (query.from) qb.andWhere('e.entered_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('e.entered_at < :to', { to: query.to });

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) {
        throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_CURSOR, 'Invalid cursor');
      }
      qb.andWhere('(e.entered_at, e.id) < (:cAt, :cId)', { cAt: cursor.enteredAt, cId: cursor.id });
    }

    const rows = await qb.getRawMany<{
      id: string;
      userId: string;
      areaId: string;
      areaName: string;
      enteredAt: Date;
      latitude: number;
      longitude: number;
    }>();

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const items = page.map((r) => ({
      ...r,
      id: String(r.id),
      enteredAt: new Date(r.enteredAt).toISOString(),
    }));
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({ enteredAt: last.enteredAt, id: last.id }) : null,
    };
  }
}
