import 'reflect-metadata';
import dataSource from './data-source';

/** Runs pending migrations. Used by the one-off `migrate` container before api/worker start. */
async function main() {
  await dataSource.initialize();
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  console.log(
    applied.length
      ? `Applied migrations: ${applied.map((m) => m.name).join(', ')}`
      : 'No pending migrations',
  );
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
