import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm-options';

/** Used by the TypeORM CLI (`npm run migration:run`). */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

export default new DataSource(buildDataSourceOptions(url));
