// Backup and restoration of the demonstration (SPEC §24, §25, P16-4):
//   pnpm db:backup   — dump of the database and copy of the stored documents, with a manifest
//   pnpm db:restore  — restores the latest backup into a separate database and checks it
//                      against the manifest (add --replace to put it in place of the demo one)
// The PostgreSQL tools come from the machine when they are recent enough, else from the same
// Docker image as the database.
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import pg from 'pg';
import { connectionConfig, withClient } from './admin.js';
import type { ToolsEnv } from './tools-env.js';

const BACKUP_ROOT = fileURLToPath(new URL('../../../../backups', import.meta.url));
const POSTGRES_IMAGE = 'postgres:18.6-alpine';
const SCHEMAS = [
  'core',
  'audit',
  'iam',
  'investor',
  'issuance',
  'registry',
  'servicing',
  'reporting',
];

export interface Manifest {
  createdAt: string;
  database: string;
  /** Rows of every table of the application's schemas. */
  tables: Record<string, number>;
  /** Digest of the ledger's hash chain: equal digests mean identical movements. */
  ledgerDigest: string;
  documents: number;
}

/** Runs pg_dump or pg_restore: local binary of version 18 or more, else the Docker image. */
function pgTool(tool: 'pg_dump' | 'pg_restore', env: ToolsEnv, args: string[]) {
  const local = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  const major = /(\d+)\./.exec(local.stdout ?? '')?.[1];
  const connection = [
    '-h',
    env.POSTGRES_HOST,
    '-p',
    String(env.POSTGRES_PORT),
    '-U',
    env.POSTGRES_USER,
  ];
  if (major && Number.parseInt(major, 10) >= 18) {
    return spawn(tool, [...connection, ...args], {
      env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
  }
  return spawn(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'host',
      '-e',
      'PGPASSWORD',
      POSTGRES_IMAGE,
      tool,
      ...connection,
      ...args,
    ],
    {
      env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD },
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  );
}

function finished(child: ReturnType<typeof spawn>, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${what} failed (${code})`)),
    );
  });
}

async function manifestOf(env: ToolsEnv, database: string, documents: number): Promise<Manifest> {
  return withClient(connectionConfig(env, database, 'admin'), async (client) => {
    const { rows: tables } = await client.query<{ name: string }>(
      `SELECT schemaname || '.' || tablename AS name FROM pg_tables WHERE schemaname = ANY($1)
       ORDER BY 1`,
      [SCHEMAS],
    );
    const counts: Record<string, number> = {};
    for (const { name } of tables) {
      const [schema, table] = name.split('.') as [string, string];
      const { rows } = await client.query<{ total: string }>(
        `SELECT count(*) AS total FROM ${pg.escapeIdentifier(schema)}.${pg.escapeIdentifier(table)}`,
      );
      counts[name] = Number.parseInt(rows[0]!.total, 10);
    }
    const { rows: digest } = await client.query<{ digest: string | null }>(
      `SELECT md5(string_agg(entry_hash, '' ORDER BY issuance_id, sequence_no)) AS digest
       FROM registry.ledger_entry`,
    );
    return {
      createdAt: new Date().toISOString(),
      database,
      tables: counts,
      ledgerDigest: digest[0]?.digest ?? 'empty',
      documents,
    };
  });
}

function storageOf(env: NodeJS.ProcessEnv) {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    return null;
  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return { client, bucket: S3_BUCKET };
}

async function copyDocuments(directory: string): Promise<number> {
  const storage = storageOf(process.env);
  if (!storage) return 0;
  let copied = 0;
  let token: string | undefined;
  do {
    const page = await storage.client.send(
      new ListObjectsV2Command({ Bucket: storage.bucket, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) {
      // Earlier backups kept in the same storage are not documents.
      if (object.Key!.startsWith(BACKUP_PREFIX)) continue;
      const target = join(directory, 'documents', object.Key!);
      mkdirSync(dirname(target), { recursive: true });
      const body = await storage.client.send(
        new GetObjectCommand({ Bucket: storage.bucket, Key: object.Key! }),
      );
      await writeFile(target, await body.Body!.transformToByteArray());
      copied += 1;
    }
    token = page.NextContinuationToken;
  } while (token);
  return copied;
}

/** Writes backups/<date>/ : database.dump, documents/ and manifest.json. */
export async function backupDatabase(env: ToolsEnv, database: string, withDocuments: boolean) {
  const directory = join(BACKUP_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(directory, { recursive: true });
  const dump = pgTool('pg_dump', env, ['-Fc', '-d', database]);
  await Promise.all([
    pipeline(dump.stdout, createWriteStream(join(directory, 'database.dump'))),
    finished(dump, 'pg_dump'),
  ]);
  const documents = withDocuments ? await copyDocuments(directory) : 0;
  const manifest = await manifestOf(env, database, documents);
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifest };
}

/** Backups kept in the storage by `--upload`: the most recent ones (D-102). */
const KEPT_BACKUPS = 14;
const BACKUP_PREFIX = 'backups/';

/**
 * Copies a backup's dump and manifest to the S3 storage (`backups/<date>/`) and deletes the
 * oldest ones beyond the last 14. Used online, where the machine's disk is not kept.
 */
export async function uploadBackup(directory: string): Promise<number> {
  const storage = storageOf(process.env);
  if (!storage) throw new Error('S3 storage is not configured: cannot upload the backup.');
  const name = directory.split('/').at(-1)!;
  for (const file of ['database.dump', 'manifest.json']) {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: `${BACKUP_PREFIX}${name}/${file}`,
        Body: await readFile(join(directory, file)),
      }),
    );
  }
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await storage.client.send(
      new ListObjectsV2Command({
        Bucket: storage.bucket,
        Prefix: BACKUP_PREFIX,
        ContinuationToken: token,
      }),
    );
    keys.push(...(page.Contents ?? []).map((object) => object.Key!));
    token = page.NextContinuationToken;
  } while (token);
  const backups = [...new Set(keys.map((key) => key.split('/')[1]!))].sort();
  const expired = backups.slice(0, Math.max(0, backups.length - KEPT_BACKUPS));
  const doomed = keys.filter((key) => expired.includes(key.split('/')[1]!));
  if (doomed.length > 0) {
    await storage.client.send(
      new DeleteObjectsCommand({
        Bucket: storage.bucket,
        Delete: { Objects: doomed.map((Key) => ({ Key })) },
      }),
    );
  }
  return backups.length - expired.length;
}

function latestBackup(): string {
  const found = existsSync(BACKUP_ROOT) ? readdirSync(BACKUP_ROOT).sort() : [];
  if (found.length === 0) throw new Error('No backup found: run "pnpm db:backup" first.');
  return join(BACKUP_ROOT, found.at(-1)!);
}

/**
 * Restores a backup into `target` (created empty), puts the documents back when it replaces the
 * demo database, and compares the result with the manifest. Throws on any difference.
 */
export async function restoreDatabase(
  env: ToolsEnv,
  target: string,
  options: { directory?: string; documents: boolean },
) {
  const directory = options.directory ?? latestBackup();
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as Manifest;
  const name = pg.escapeIdentifier(target);
  await withClient(connectionConfig(env, 'postgres', 'admin'), async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name} OWNER va_migrator`);
  });
  const restore = pgTool('pg_restore', env, ['--exit-on-error', '-d', target]);
  await Promise.all([
    pipeline(createReadStream(join(directory, 'database.dump')), restore.stdin),
    finished(restore, 'pg_restore'),
  ]);
  let documents = 0;
  const storage = storageOf(process.env);
  const documentsDirectory = join(directory, 'documents');
  if (options.documents && storage && existsSync(documentsDirectory)) {
    for (const file of readdirSync(documentsDirectory, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const path = join(file.parentPath, file.name);
      await storage.client.send(
        new PutObjectCommand({
          Bucket: storage.bucket,
          Key: path.slice(documentsDirectory.length + 1),
          Body: await readFile(path),
        }),
      );
      documents += 1;
    }
  }
  const restored = await manifestOf(
    env,
    target,
    options.documents ? documents : manifest.documents,
  );
  const differences = Object.keys({ ...manifest.tables, ...restored.tables }).filter(
    (table) => manifest.tables[table] !== restored.tables[table],
  );
  if (differences.length > 0 || restored.ledgerDigest !== manifest.ledgerDigest) {
    throw new Error(
      `Restored database differs from the backup: ${[...differences, restored.ledgerDigest !== manifest.ledgerDigest ? 'ledger' : ''].filter(Boolean).join(', ')}`,
    );
  }
  return { directory, tables: Object.keys(restored.tables).length, documents: restored.documents };
}
