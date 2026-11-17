import { TEST_ENV } from './setup-env';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap';
import { APP_CONFIG, AppConfig } from '../src/config/app-config';
import { buildDataSourceOptions } from '../src/database/typeorm-options';
import { TrackingService } from '../src/tracking/tracking.service';
import { RetentionProcessor } from '../src/worker/retention.processor';
import { WorkerModule } from '../src/worker/worker.module';
import { buildSwaggerDocument } from '../src/swagger';

const ADMIN = { 'x-api-key': TEST_ENV.API_KEY_ADMIN };
const INGEST = { 'x-api-key': TEST_ENV.API_KEY_INGEST };

const rect = (minLng: number, minLat: number, maxLng: number, maxLat: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ],
});

// One degree of longitude at latitude ~40.98 is ~84 km.
const METERS_PER_DEG_LNG = 111_320 * Math.cos((40.98 * Math.PI) / 180);
const lngMeters = (m: number) => m / METERS_PER_DEG_LNG;

describe('Location Tracking Service (e2e)', () => {
  let api: INestApplication;
  let worker: INestApplication;
  let db: DataSource;
  let tracking: TrackingService;
  let ids: Record<string, string>;
  const http = () => request(api.getHttpServer());

  beforeAll(async () => {
    // Fresh schema + empty Redis DB for every run.
    const admin = new DataSource(buildDataSourceOptions(TEST_ENV.DATABASE_URL));
    await admin.initialize();
    await admin.query(
      'DROP TABLE IF EXISTS user_area_states, area_entries, areas, migrations CASCADE',
    );
    await admin.runMigrations();
    await admin.destroy();
    const redis = new Redis(TEST_ENV.REDIS_URL);
    await redis.flushdb();
    await redis.quit();

    const apiRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    api = configureHttpApp(apiRef.createNestApplication<NestExpressApplication>({ logger: false }));
    await api.init();

    const workerRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    worker = workerRef.createNestApplication({ logger: false });
    await worker.init();

    db = api.get(DataSource);
    tracking = worker.get(TrackingService);

    ids = {};
    for (const [name, geometry] of Object.entries({
      Kadikoy: rect(29.02, 40.96, 29.1, 41.0),
      Moda: rect(29.02, 40.977, 29.035, 40.988),
      Uskudar: rect(29.0, 41.0, 29.1, 41.05),
    })) {
      const res = await http().post('/areas').set(ADMIN).send({ name, geometry }).expect(201);
      ids[name] = res.body.id;
    }
  });

  afterAll(async () => {
    await worker?.close();
    await api?.close();
  });

  const entriesOf = async (userId: string) =>
    (
      await db.query(
        `SELECT a.name FROM area_entries e JOIN areas a ON a.id = e.area_id
          WHERE e.user_id = $1 ORDER BY e.entered_at, a.name`,
        [userId],
      )
    ).map((r: { name: string }) => r.name);

  const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000);

  describe('authentication', () => {
    it('rejects requests without an API key', () => http().get('/areas').expect(401));
    it('rejects an unknown API key', () =>
      http().get('/areas').set({ 'x-api-key': 'wrong-key-1234567' }).expect(401));
    it('does not let the ingest key read logs or manage areas', async () => {
      await http().get('/logs').set(INGEST).expect(403);
      await http().post('/areas').set(INGEST).send({}).expect(403);
    });
    it('keeps health public', () =>
      http()
        .get('/health/ready')
        .expect(200, { status: 'ok', checks: { database: 'up', redis: 'up' } }));
  });

  describe('Swagger document', () => {
    it('declares a concrete type for every query parameter (an "object" query param hangs Swagger UI)', () => {
      const doc = buildSwaggerDocument(api);
      const params = Object.entries(doc.paths).flatMap(([path, item]) =>
        Object.values(item).flatMap(
          (op: { parameters?: { in: string; name: string; schema?: { type?: string } }[] }) =>
            (op.parameters ?? [])
              .filter((p) => p.in === 'query')
              .map((p) => ({ path, name: p.name, type: p.schema?.type })),
        ),
      );
      expect(params.length).toBeGreaterThan(0);
      expect(params.filter((p) => !p.type || p.type === 'object')).toEqual([]);
      expect(params).toContainEqual({ path: '/logs', name: 'limit', type: 'number' });
    });
  });

  describe('POST /areas', () => {
    it('rejects a duplicate name case-insensitively with 409', async () => {
      const res = await http()
        .post('/areas')
        .set(ADMIN)
        .send({ name: 'kadikoy', geometry: rect(1, 1, 2, 2) })
        .expect(409);
      expect(res.body.error).toBe('AREA_NAME_CONFLICT');
    });

    it('rejects a self-intersecting (bow-tie) polygon', async () => {
      const bowtie = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        ],
      };
      const res = await http()
        .post('/areas')
        .set(ADMIN)
        .send({ name: 'Bowtie', geometry: bowtie })
        .expect(400);
      expect(res.body.error).toBe('INVALID_POLYGON');
      expect(res.body.details[0]).toMatch(/Self-intersection/);
    });

    it('rejects unknown fields', () =>
      http()
        .post('/areas')
        .set(ADMIN)
        .send({ name: 'X', geometry: rect(1, 1, 2, 2), color: 'red' })
        .expect(400));
  });

  describe('GET /areas', () => {
    it('paginates', async () => {
      const res = await http().get('/areas?page=2&limit=2').set(ADMIN).expect(200);
      expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].geometry.type).toBe('Polygon');
    });
  });

  describe('POST /locations', () => {
    const body = (over: Record<string, unknown> = {}) => ({
      userId: 'api-user',
      latitude: 40.98,
      longitude: 29.03,
      timestamp: at(5).toISOString(),
      ...over,
    });

    it('accepts a valid location with 202', () =>
      http().post('/locations').set(INGEST).send(body()).expect(202));

    it.each([
      ['TIMESTAMP_IN_FUTURE', { timestamp: new Date(Date.now() + 3600_000).toISOString() }],
      ['TIMESTAMP_TOO_OLD', { timestamp: at(2 * 86400).toISOString() }],
      ['INVALID_COORDINATES', { latitude: 0, longitude: 0 }],
    ])('rejects %s with 422', async (code, over) => {
      const res = await http().post('/locations').set(INGEST).send(body(over)).expect(422);
      expect(res.body.error).toBe(code);
    });

    it.each([
      ['latitude out of range', { latitude: 91 }],
      ['coordinates as strings', { latitude: '40.98' }],
      ['timestamp without timezone', { timestamp: '2026-11-17T10:00:00' }],
      ['missing userId', { userId: undefined }],
      ['unknown field', { speed: 12 }],
    ])('rejects %s with 400', (_label, over) =>
      http().post('/locations').set(INGEST).send(body(over)).expect(400),
    );

    it('is processed by the worker end-to-end and shows up in GET /logs', async () => {
      await http()
        .post('/locations')
        .set(INGEST)
        .send(body({ userId: 'flow-user', latitude: 40.982, longitude: 29.027 }))
        .expect(202);

      let items: { areaName: string }[] = [];
      for (let i = 0; i < 50 && items.length < 2; i++) {
        await new Promise((r) => setTimeout(r, 100));
        items = (await http().get('/logs?userId=flow-user').set(ADMIN).expect(200)).body.items;
      }
      expect(items.map((i) => i.areaName).sort()).toEqual(['Kadikoy', 'Moda']);
    });
  });

  describe('entry detection against PostGIS', () => {
    const MODA_EAST_EDGE = 29.035;
    const loc = (userId: string, longitude: number, secondsAgo: number, latitude = 40.982) => ({
      userId,
      latitude,
      longitude,
      timestamp: at(secondsAgo),
    });

    it('scenario 3: 10 concurrent copies of the same location create exactly one entry per area', async () => {
      const same = loc('dup-user', 29.027, 60); // one location, delivered 10 times at once
      const results = await Promise.all(
        Array.from({ length: 10 }, () => tracking.process({ ...same })),
      );
      expect(results.filter((r) => r.outcome === 'processed')).toHaveLength(1);
      expect(results.filter((r) => r.outcome === 'stale')).toHaveLength(9);
      expect(await entriesOf('dup-user')).toEqual(['Kadikoy', 'Moda']);
    });

    it('scenario 2: a late, older location does not create a fake re-entry', async () => {
      await tracking.process(loc('ooo-user', 29.027, 60)); // :00 in Moda
      await tracking.process(loc('ooo-user', 29.03 + 0.05, 50)); // :10 far away (still Kadikoy)
      const late = await tracking.process(loc('ooo-user', 29.027, 55)); // :05 arrives late
      expect(late.outcome).toBe('stale');
      expect(await entriesOf('ooo-user')).toEqual(['Kadikoy', 'Moda']);
    });

    it('scenario 4: entering the inner area while inside the outer one logs only the inner area', async () => {
      await tracking.process(loc('nest-user', 29.06, 60)); // Kadikoy only
      await tracking.process(loc('nest-user', 29.027, 50)); // walks into Moda
      expect(await entriesOf('nest-user')).toEqual(['Kadikoy', 'Moda']);
    });

    it('scenario 5: a point exactly on the boundary is inside', async () => {
      const res = await tracking.process(loc('edge-user', MODA_EAST_EDGE, 60));
      expect(res.outcome === 'processed' && res.enteredAreaIds).toContain(ids.Moda);
    });

    it('scenario 6: jitter within the exit buffer yields one entry, leaving beyond it allows a new one', async () => {
      const u = 'jitter-user';
      const path = [
        MODA_EAST_EDGE - lngMeters(2), // 2m inside
        MODA_EAST_EDGE + lngMeters(3), // 3m outside (buffer)
        MODA_EAST_EDGE - lngMeters(1),
        MODA_EAST_EDGE + lngMeters(4),
        MODA_EAST_EDGE - lngMeters(2),
      ];
      for (const [i, lng] of path.entries()) await tracking.process(loc(u, lng, 100 - i * 5));
      expect(await entriesOf(u)).toEqual(['Kadikoy', 'Moda']);

      await tracking.process(loc(u, MODA_EAST_EDGE + lngMeters(30), 60)); // 30m outside → left
      await tracking.process(loc(u, MODA_EAST_EDGE - lngMeters(5), 55)); // real re-entry
      expect((await entriesOf(u)).filter((n: string) => n === 'Moda')).toHaveLength(2);
    });

    it('scenario 7: after STATE_TTL of silence the same area is entered again', async () => {
      const u = 'ttl-user';
      await tracking.process(loc(u, 29.027, 3 * 3600)); // 3 hours ago in Moda
      await tracking.process(loc(u, 29.027, 60)); // now in Moda again
      expect(await entriesOf(u)).toEqual(['Kadikoy', 'Moda', 'Kadikoy', 'Moda']);
    });

    it('adjacent areas: a point on the shared border is in both', async () => {
      const res = await tracking.process(loc('border-user', 29.05, 60, 41.0));
      expect(res.outcome === 'processed' && res.enteredAreaIds.sort()).toEqual(
        [ids.Kadikoy, ids.Uskudar].sort(),
      );
    });
  });

  describe('GET /logs', () => {
    const base = Date.now() - 80_000_000;
    const entryTime = (i: number) => new Date(base + i * 2_000_000);

    beforeAll(async () => {
      // 7 locations in Moda, each ~33 minutes apart (> STATE_TTL) → 7 × (Kadikoy + Moda) entries.
      for (let i = 0; i < 7; i++) {
        await tracking.process({
          userId: 'page-user',
          latitude: 40.982,
          longitude: 29.027,
          timestamp: entryTime(i),
        });
      }
    });

    it('walks all pages with the cursor without gaps or duplicates', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res: request.Response = await http()
          .get('/logs')
          .query({ userId: 'page-user', limit: 3, ...(cursor ? { cursor } : {}) })
          .set(ADMIN)
          .expect(200);
        seen.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(14); // 7 × (Kadikoy + Moda)
      expect(new Set(seen).size).toBe(14);
    });

    it('returns newest first', async () => {
      const { items } = (await http().get('/logs?userId=page-user&limit=200').set(ADMIN)).body;
      const times = items.map((i: { enteredAt: string }) => Date.parse(i.enteredAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('filters by area and time range', async () => {
      const from = entryTime(3).toISOString(); // inclusive → entries 3, 4, 5, 6
      const { items } = (
        await http()
          .get('/logs')
          .query({ userId: 'page-user', areaId: ids.Moda, from })
          .set(ADMIN)
          .expect(200)
      ).body;
      expect(items).toHaveLength(4);
      expect(items.every((i: { areaName: string }) => i.areaName === 'Moda')).toBe(true);
    });

    it('rejects a tampered cursor', async () => {
      const res = await http().get('/logs?cursor=abc').set(ADMIN).expect(400);
      expect(res.body.error).toBe('INVALID_CURSOR');
    });
  });

  describe('log retention', () => {
    it('purges entries older than the retention period in batches', async () => {
      const config = worker.get<AppConfig>(APP_CONFIG);
      const retention = worker.get(RetentionProcessor);
      await db.query(
        `INSERT INTO area_entries (user_id, area_id, entered_at, latitude, longitude)
         SELECT 'old-user', $1, now() - interval '100 days' - (g || ' seconds')::interval, 40.98, 29.03
           FROM generate_series(1, 25) g`,
        [ids.Moda],
      );
      const original = { ...config.retention };
      Object.assign(config.retention, { logRetentionDays: 90, batchSize: 10 });
      try {
        expect(await retention.purge(new Date())).toBe(25);
        expect(await entriesOf('old-user')).toEqual([]);
        expect((await entriesOf('page-user')).length).toBe(14); // recent rows untouched
      } finally {
        Object.assign(config.retention, original);
      }
    });
  });

  describe('rate limiting', () => {
    it('limits per userId and answers 429 with Retry-After', async () => {
      const config = api.get<AppConfig>(APP_CONFIG);
      const original = config.rateLimit.locationsPerMinute;
      config.rateLimit.locationsPerMinute = 3;
      try {
        const send = (userId: string, i: number) =>
          http()
            .post('/locations')
            .set(INGEST)
            .send({
              userId,
              latitude: 40.98,
              longitude: 29.03,
              timestamp: at(100 - i).toISOString(),
            });
        for (let i = 0; i < 3; i++) await send('rl-user', i).expect(202);
        const res = await send('rl-user', 3).expect(429);
        expect(res.body.error).toBe('RATE_LIMITED');
        expect(res.headers['retry-after']).toBeDefined();
        await send('other-user', 0).expect(202); // other users are not affected
      } finally {
        config.rateLimit.locationsPerMinute = original;
      }
    });
  });
});
