// Vitest global setup of the integration tests: rebuilds the test database from scratch before
// every run, so tests always start from the migrations and the deterministic seed.
import { bootstrapDatabase, dropDatabase, migrateDatabase } from './admin.js';
import { seedDatabase } from './seed.js';
import { loadToolsEnv } from './tools-env.js';

export default async function setup(): Promise<void> {
  const env = loadToolsEnv();
  await dropDatabase(env, 'test');
  await bootstrapDatabase(env, 'test');
  await migrateDatabase(env, 'test');
  await seedDatabase(env, 'test');
}
