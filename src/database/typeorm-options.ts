import { DataSourceOptions } from 'typeorm';
import { Area } from '../areas/area.entity';
import { AreaEntry } from '../logs/area-entry.entity';
import { UserAreaState } from '../tracking/user-area-state.entity';
import { InitialSchema1763400000000 } from './migrations/1763400000000-InitialSchema';

export const ENTITIES = [Area, AreaEntry, UserAreaState];
export const MIGRATIONS = [InitialSchema1763400000000];

/** Schema is owned by migrations only – `synchronize` is never used. */
export function buildDataSourceOptions(url: string, poolSize = 10): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsRun: false,
    extra: { max: poolSize },
  };
}
