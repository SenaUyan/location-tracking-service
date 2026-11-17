import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1763400000000 implements MigrationInterface {
  name = 'InitialSchema1763400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    // ---------- areas ----------
    await q.query(`
      CREATE TABLE areas (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        varchar(100) NOT NULL,
        geometry    geometry(Polygon, 4326) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_areas_geometry_valid CHECK (ST_IsValid(geometry))
      )`);
    // "Kadikoy" and "kadikoy" are the same area name.
    await q.query(`CREATE UNIQUE INDEX uq_areas_name_ci ON areas (lower(name))`);
    // Spatial index for "which areas cover this point" (ST_Covers).
    await q.query(`CREATE INDEX idx_areas_geometry ON areas USING GIST (geometry)`);
    // Spatial index on the geography cast for metric distance checks (ST_DWithin in meters).
    await q.query(`CREATE INDEX idx_areas_geography ON areas USING GIST ((geometry::geography))`);
    await q.query(`CREATE INDEX idx_areas_created_at ON areas (created_at DESC, id DESC)`);

    // ---------- area_entries (logs) ----------
    await q.query(`
      CREATE TABLE area_entries (
        id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id     varchar(64) NOT NULL,
        area_id     uuid NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
        entered_at  timestamptz NOT NULL,
        latitude    double precision NOT NULL,
        longitude   double precision NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_area_entries_user_area_time UNIQUE (user_id, area_id, entered_at)
      )`);
    // Indexes match the keyset pagination ORDER BY (entered_at DESC, id DESC) per filter.
    await q.query(`CREATE INDEX idx_area_entries_time ON area_entries (entered_at DESC, id DESC)`);
    await q.query(
      `CREATE INDEX idx_area_entries_user_time ON area_entries (user_id, entered_at DESC, id DESC)`,
    );
    await q.query(
      `CREATE INDEX idx_area_entries_area_time ON area_entries (area_id, entered_at DESC, id DESC)`,
    );

    // ---------- user_area_states ----------
    await q.query(`
      CREATE TABLE user_area_states (
        user_id           varchar(64) PRIMARY KEY,
        area_ids          uuid[] NOT NULL DEFAULT '{}',
        last_location_at  timestamptz,
        last_latitude     double precision,
        last_longitude    double precision,
        updated_at        timestamptz NOT NULL DEFAULT now()
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_area_states`);
    await q.query(`DROP TABLE IF EXISTS area_entries`);
    await q.query(`DROP TABLE IF EXISTS areas`);
  }
}
