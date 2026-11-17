import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Area } from '../areas/area.entity';

/**
 * One row per detected area entry. The unique constraint on (user_id, area_id, entered_at)
 * is the database-level guarantee against duplicate entries (retries / concurrent workers).
 */
@Entity({ name: 'area_entries' })
@Index('uq_area_entries_user_area_time', ['userId', 'areaId', 'enteredAt'], { unique: true })
export class AreaEntry {
  /** bigint identity – used as the tie-breaker of the keyset (cursor) pagination. */
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ name: 'area_id', type: 'uuid' })
  areaId: string;

  @ManyToOne(() => Area, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'area_id' })
  area?: Area;

  /** Device timestamp of the first location observed inside the area. */
  @Column({ name: 'entered_at', type: 'timestamptz' })
  enteredAt: Date;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
