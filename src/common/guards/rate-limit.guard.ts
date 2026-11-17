import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import Redis from 'ioredis';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { REDIS } from '../../redis/redis.module';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { RATE_LIMIT_KEY, RateLimitScope } from '../decorators/rate-limit.decorator';
import { API_KEY_HEADER, AuthenticatedRequest } from './api-key.guard';

const WINDOW_SECONDS = 60;

/**
 * Fixed-window rate limiter backed by Redis, so every API replica shares the same counters.
 * Runs after ApiKeyGuard. Fails open if Redis is unavailable: rate limiting is a protection,
 * it must not take the ingestion path down with it.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<RateLimitScope>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    const { identity, limit } = this.resolve(scope, req);
    const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    const key = `ratelimit:${scope}:${identity}:${window}`;

    let count: number;
    try {
      const [[, incr]] = (await this.redis
        .multi()
        .incr(key)
        .expire(key, WINDOW_SECONDS * 2)
        .exec()) as [[Error | null, number]];
      count = incr;
    } catch {
      return true;
    }

    const resetIn = WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % WINDOW_SECONDS);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));

    if (count > limit) {
      res.setHeader('Retry-After', resetIn);
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
        'Too many requests',
        {
          retryAfterSeconds: resetIn,
        },
      );
    }
    return true;
  }

  private resolve(scope: RateLimitScope, req: AuthenticatedRequest) {
    if (scope === 'user') {
      // Body is not validated yet at guard time; a missing/odd userId falls back to the client IP
      // and the request is rejected by validation right after.
      const raw: unknown = (req.body as Record<string, unknown> | undefined)?.userId;
      const identity =
        typeof raw === 'string' && raw.length > 0 && raw.length <= 64 ? `u:${raw}` : `ip:${req.ip}`;
      return { identity, limit: this.config.rateLimit.locationsPerMinute };
    }
    const apiKey = req.header(API_KEY_HEADER) ?? '';
    // Never store raw keys in Redis.
    const identity = `k:${createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
    return { identity, limit: this.config.rateLimit.adminPerMinute };
  }
}
