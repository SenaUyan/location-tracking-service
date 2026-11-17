import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { ApiRole, PUBLIC_ROUTE_KEY, REQUIRED_ROLE_KEY } from '../decorators/require-role.decorator';

export const API_KEY_HEADER = 'x-api-key';

/** Request augmented with the role resolved from its API key. */
export interface AuthenticatedRequest extends Request {
  apiRole?: ApiRole;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual avoids leaking key contents through response timing.
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Role based API key authentication (least privilege):
 * - ingest key: mobile app, may only send locations
 * - admin key:  back office, may manage areas, read logs and also send locations
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets)) return true;

    const required =
      this.reflector.getAllAndOverride<ApiRole>(REQUIRED_ROLE_KEY, targets) ?? 'admin';
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const provided = req.header(API_KEY_HEADER);

    if (!provided) {
      throw new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Missing API key');
    }

    const role: ApiRole | undefined = safeEqual(provided, this.config.apiKeys.admin)
      ? 'admin'
      : safeEqual(provided, this.config.apiKeys.ingest)
        ? 'ingest'
        : undefined;

    if (!role) {
      throw new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Invalid API key');
    }
    if (required === 'admin' && role !== 'admin') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'This API key is not allowed to access this resource',
      );
    }

    req.apiRole = role;
    return true;
  }
}
