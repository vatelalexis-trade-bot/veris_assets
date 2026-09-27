// Entry point of the database commands:
//   pnpm db:setup  — create roles and database if needed, apply migrations, load demo data
//   pnpm db:migrate — apply pending migrations only
//   pnpm db:seed   — load demo data only
//   pnpm db:reset  — delete the demo database and rebuild it from scratch (fictitious data only)
//   pnpm db:backup — dump of the database and copy of the documents into backups/ (--database-only);
//                    --upload also copies it to the S3 storage and keeps the last 14 there
//   pnpm db:restore — restores the latest backup into <database>_restore and checks it; with
//                     --replace, puts it in place of the demo database and its documents
// Add --test to work on the integration test database instead of the demo one.
import { bootstrapDatabase, dropDatabase, migrateDatabase } from './admin.js';
import { backupDatabase, restoreDatabase, uploadBackup } from './backup.js';
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
  async backup(env: ToolsEnv, target: DatabaseTarget, flags: string[]) {
    const { directory, manifest } = await backupDatabase(
      env,
      databaseName(env, target),
      !flags.includes('--database-only'),
    );
    console.log(`Backup written to ${directory} (${manifest.documents} documents).`);
    if (flags.includes('--upload')) {
      const kept = await uploadBackup(directory);
      console.log(`Backup copied to the storage; ${kept} backups kept there.`);
    }
  },
  async restore(env: ToolsEnv, target: DatabaseTarget, flags: string[]) {
    const replace = flags.includes('--replace');
    const database = databaseName(env, target);
    if (replace && env.NODE_ENV === 'production' && env.DEMO_MODE !== 'true') {
      throw new Error('Refusing to replace a database in production outside a demonstration.');
    }
    const result = await restoreDatabase(env, replace ? database : `${database}_restore`, {
      documents: replace,
    });
    console.log(
      `Backup ${result.directory} restored into ${replace ? database : `${database}_restore`}: ` +
        `${result.tables} tables identical to the backup, ledger chain identical.`,
    );
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
  await COMMANDS[command](env, target, flags);
  console.log(`Database "${databaseName(env, target)}": ${command} done.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
