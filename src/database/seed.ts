import 'reflect-metadata';
import dataSource from './data-source';

/**
 * Demo areas in Istanbul (simplified, approximate rectangles – not official borders).
 * Chosen on purpose to exercise the interesting cases:
 * - Moda lies completely inside Kadikoy             → nested areas
 * - Acibadem straddles the Kadikoy / Uskudar border  → partially overlapping areas
 * - Kadikoy and Uskudar share a border at lat 41.00  → adjacent areas
 * Idempotent: existing names are skipped.
 */
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

export const DEMO_AREAS = [
  { name: 'Kadikoy', geometry: rect(29.02, 40.96, 29.1, 41.0) },
  { name: 'Uskudar', geometry: rect(29.0, 41.0, 29.1, 41.05) },
  { name: 'Moda', geometry: rect(29.02, 40.977, 29.035, 40.988) },
  { name: 'Acibadem', geometry: rect(29.04, 40.995, 29.06, 41.01) },
];

async function main() {
  if (process.env.SEED_DEMO_DATA === 'false') {
    console.log('SEED_DEMO_DATA=false, skipping demo areas');
    return;
  }
  await dataSource.initialize();
  for (const area of DEMO_AREAS) {
    await dataSource.query(
      `INSERT INTO areas (name, geometry)
       VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))
       ON CONFLICT ((lower(name))) DO NOTHING`,
      [area.name, JSON.stringify(area.geometry)],
    );
  }
  console.log(`Demo areas ensured: ${DEMO_AREAS.map((a) => a.name).join(', ')}`);
  await dataSource.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
