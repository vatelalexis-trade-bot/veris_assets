import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { s3ClientConfig } from '../providers/document-storage.js';
import { Redis } from 'ioredis';
import type pg from 'pg';
import type { Env } from '../config/env.js';
import { READINESS_TIMEOUT_MS, type ReadinessCheck } from './readiness-check.js';

// Redis and storage checks open a short-lived connection and close it; their shared clients
// arrive with rate limiting (phase 5) and documents (phase 8).

/** Runs a trivial query through the API's own pool, hence with the va_app role. */
export function postgresCheck(pool: pg.Pool): ReadinessCheck {
  return {
    name: 'database',
    async check() {
      await pool.query('SELECT 1');
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
      const client = new S3Client({ ...s3ClientConfig(env), maxAttempts: 1 });
      try {
        await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      } finally {
        client.destroy();
      }
    },
  };
}
