import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Redis } from 'ioredis';
import pg from 'pg';
import type { Env } from '../config/env.js';
import { READINESS_TIMEOUT_MS, type ReadinessCheck } from './readiness-check.js';

// Each check opens a short-lived connection and closes it. Shared connection pools arrive with
// the data layer (phase 3); the checks will then reuse them.

export function postgresCheck(env: Env): ReadinessCheck {
  return {
    name: 'database',
    async check() {
      const client = new pg.Client({
        host: env.POSTGRES_HOST,
        port: env.POSTGRES_PORT,
        database: env.POSTGRES_DB,
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        connectionTimeoutMillis: READINESS_TIMEOUT_MS,
      });
      try {
        await client.connect();
        await client.query('SELECT 1');
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
}

export function redisCheck(env: Env): ReadinessCheck {
  return {
    name: 'redis',
    async check() {
      const client = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        lazyConnect: true,
        connectTimeout: READINESS_TIMEOUT_MS,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
      });
      try {
        await client.connect();
        await client.ping();
      } finally {
        client.disconnect();
      }
    },
  };
}

/** Checks that the storage answers and that the configured key can access the bucket. */
export function storageCheck(env: Env): ReadinessCheck {
  return {
    name: 'storage',
    async check() {
      const client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        forcePathStyle: true,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
        maxAttempts: 1,
      });
      try {
        await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      } finally {
        client.destroy();
      }
    },
  };
}
