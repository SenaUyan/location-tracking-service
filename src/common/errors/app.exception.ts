import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Domain error carrying a stable error code and optional extra fields that are merged
 * into the response body (e.g. `serverTime` for timestamp errors).
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super({ code, message, ...extra }, status);
  }
}
