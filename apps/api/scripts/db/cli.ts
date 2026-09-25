// Entry point of the database commands:
//   pnpm db:setup  — create roles and database if needed, apply migrations, load demo data
//   pnpm db:migrate — apply pending migrations only
//   pnpm db:seed   — load demo data only
//   pnpm db:reset  — delete the demo database and rebuild it from scratch (fictitious data only)
// Add --test to work on the integration test database instead of the demo one.
import { bootstrapDatabase, dropDatabase, migrateDatabase } from './admin.js';
import { seedDatabase } from './seed.js';
import { databaseName, loadToolsEnv, type DatabaseTarget, type ToolsEnv } from './tools-env.js';

const COMMANDS = {
  async setup(env: ToolsEnv, target: DatabaseTarget) {
    await bootstrapDatabase(env, target);
    await migrateDatabase(env, target);
    await seedDatabase(env, target);
  },
  migrate: migrateDatabase,
  seed: seedDatabase,
  async reset(env: ToolsEnv, target: DatabaseTarget) {
    await dropDatabase(env, target);
    await COMMANDS.setup(env, target);
  },
} as const;

type Command = keyof typeof COMMANDS;

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && Object.hasOwn(COMMANDS, value);
}

async function main(): Promise<void> {
  const [command, ...flags] = process.argv.slice(2);
  if (!isCommand(command)) {
    throw new Error(`Usage: db <${Object.keys(COMMANDS).join('|')}> [--test]`);
  }
  const target: DatabaseTarget = flags.includes('--test') ? 'test' : 'demo';
  const env = loadToolsEnv();
  await COMMANDS[command](env, target);
  console.log(`Database "${databaseName(env, target)}": ${command} done.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
