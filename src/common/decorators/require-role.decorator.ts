import { SetMetadata } from '@nestjs/common';

export type ApiRole = 'admin' | 'ingest';
export const REQUIRED_ROLE_KEY = 'requiredRole';
export const PUBLIC_ROUTE_KEY = 'publicRoute';

/** Route requires an API key with the given role. `admin` keys may call every route. */
export const RequireRole = (role: ApiRole) => SetMetadata(REQUIRED_ROLE_KEY, role);

/** Route does not require an API key (health, metrics). */
export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
