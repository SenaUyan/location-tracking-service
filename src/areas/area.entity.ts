import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { Polygon } from './geojson.types';

@Entity({ name: 'areas' })
export class Area {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique (case-insensitive) – enforced by a functional unique index in the migration. */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Stored as PostGIS geometry(Polygon, 4326); TypeORM (de)serializes it as GeoJSON. */
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  geometry: Polygon;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
