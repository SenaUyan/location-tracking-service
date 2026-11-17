import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * The "notebook": what we last knew about a user. One row per user, locked with
 * SELECT ... FOR UPDATE while a location of that user is processed.
 */
@Entity({ name: 'user_area_states' })
export class UserAreaState {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  /** Areas the user is currently considered to be in (including the exit buffer). */
  @Column({ name: 'area_ids', type: 'uuid', array: true, default: () => "'{}'" })
  areaIds: string[];

  /** Device timestamp of the last processed location; null = never processed. */
  @Column({ name: 'last_location_at', type: 'timestamptz', nullable: true })
  lastLocationAt: Date | null;

  @Column({ name: 'last_latitude', type: 'double precision', nullable: true })
  lastLatitude: number | null;

  @Column({ name: 'last_longitude', type: 'double precision', nullable: true })
  lastLongitude: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
