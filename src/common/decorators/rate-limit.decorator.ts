import { SetMetadata } from '@nestjs/common';

/**
 * - `user`:   counts requests per `userId` from the body. Mobile carriers put thousands of users
 *             behind one IP (CGNAT), so limiting by IP would punish innocent users.
 * - `client`: counts requests per API key (admin / back-office traffic).
 */
export type RateLimitScope = 'user' | 'client';
export const RATE_LIMIT_KEY = 'rateLimitScope';

export const RateLimit = (scope: RateLimitScope) => SetMetadata(RATE_LIMIT_KEY, scope);
