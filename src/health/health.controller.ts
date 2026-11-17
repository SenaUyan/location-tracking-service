import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/require-role.decorator';
import { REDIS } from '../redis/redis.module';

const CHECK_TIMEOUT_MS = 2000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * - live:  the process is up (if not → restart it)
 * - ready: dependencies are reachable (if not → stop routing traffic to this instance)
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (PostgreSQL + Redis)' })
  async ready(@Res({ passthrough: true }) res: Response) {
    const check = async (fn: () => Promise<unknown>) => {
      try {
        await withTimeout(fn());
        return 'up';
      } catch {
        return 'down';
      }
    };
    const [database, redis] = await Promise.all([
      check(() => this.dataSource.query('SELECT 1')),
      check(() => this.redis.ping()),
    ]);
    const ok = database === 'up' && redis === 'up';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'error', checks: { database, redis } };
  }
}
