import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../config/env.js';

/** Storage of the document files (SPEC §16, §27). */
export interface DocumentStorageProvider {
  put(key: string, content: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

/** Settings of the S3 client, shared with the readiness check. */
export function s3ClientConfig(env: Env) {
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };
}

/**
 * S3-compatible storage (Garage in development, D-005). Files are never exposed to the browser:
 * downloads go through the API (decision D-045).
 */
export class S3DocumentStorage implements DocumentStorageProvider {
  private readonly client: S3Client;

  constructor(private readonly env: Env) {
    this.client = new S3Client({ ...s3ClientConfig(env), maxAttempts: 2 });
  }

  async put(key: string, content: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: content,
        ContentType: mimeType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
    );
    if (!result.Body) throw new Error(`Empty object ${key}`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  destroy(): void {
    this.client.destroy();
  }
}
