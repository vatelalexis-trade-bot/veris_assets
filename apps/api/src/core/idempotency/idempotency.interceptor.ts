import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { and, eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { from, lastValueFrom, mergeMap, type Observable } from 'rxjs';
import { currentUser, type RequestUser } from '../context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withoutTenantTransaction,
  withRequestTransaction,
  withTenantTransaction,
} from '../database/database.js';
import { idempotencyKey } from '../database/schema.js';
import { AppError } from '../errors/app-error.js';
import { receiveUpload, UPLOAD, uploadFingerprint } from '../documents/upload.interceptor.js';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT } from './idempotent.decorator.js';
import { requestHash } from './request-hash.js';

/** Keys are kept 24 hours (docs/ARCHITECTURE.md §4.8), then purged by a daily job. */
export const IDEMPOTENCY_KEY_LIFETIME_HOURS = 24;
/** How long a repeated request waits for the first one to finish before getting a 409. */
const IN_PROGRESS_WAIT = '3s';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** PostgreSQL error "lock_not_available", raised when `lock_timeout` is reached. */
const LOCK_NOT_AVAILABLE = '55P03';

type StoredKey = typeof idempotencyKey.$inferSelect;

/**
 * Idempotency of the routes marked `@Idempotent()` (docs/ARCHITECTURE.md §4.8).
 * The whole request runs in one transaction: the key is inserted first, the business work joins
 * the transaction, then the answer is stored. So the key and the effect commit together (or not
 * at all: a failed request can be sent again with the same key). A second request with the same
 * key waits for the first one: it then gets the stored answer, a 422 if its content differs, or
 * a 409 if the first one is still running after a few seconds.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const idempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!idempotent) return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const header = request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
    if (!UUID.test(key)) {
      throw new AppError('VALIDATION_FAILED', [
        { code: 'INVALID_IDEMPOTENCY_KEY', field: IDEMPOTENCY_KEY_HEADER },
      ]);
    }
    const path = request.originalUrl.split('?')[0]!;
    const upload = this.reflector.get<boolean | undefined>(UPLOAD, context.getHandler());
    return from(upload ? receiveUpload(request, response) : Promise.resolve()).pipe(
      mergeMap(() =>
        this.run(next, response, {
          user: currentUser(),
          key: key.toLowerCase(),
          method: request.method,
          path,
          // A file upload is identified by its fields and the file's content.
          hash: requestHash(
            request.method,
            path,
            upload ? uploadFingerprint(request) : request.body,
          ),
          status:
            this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ??
            (request.method === 'POST' ? 201 : 200),
        }),
      ),
    );
  }

  /** One transaction for the key, the work and the stored answer. */
  private run(next: CallHandler, response: Response, claim: Claim): Observable<unknown> {
    return from(
      withRequestTransaction(this.db, async () => {
        const stored = await this.claim(claim);
        if (stored) {
          response.setHeader('Idempotent-Replayed', 'true');
          return stored.responseBody ?? undefined;
        }
        const result: unknown = await lastValueFrom(next.handle(), { defaultValue: undefined });
        await this.complete(claim, result);
        return result;
      }),
    );
  }

  /** The key's scope: the user's tenant, or no tenant for platform users. */
  private inScope<T>(user: RequestUser, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return user.tenantId
      ? withTenantTransaction(this.db, user.tenantId, work)
      : withoutTenantTransaction(this.db, work);
  }

  /** Inserts the key; returns the stored answer when the same request was already made. */
  private async claim(claim: Claim): Promise<StoredKey | null> {
    const existing = await this.inScope(claim.user, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${IN_PROGRESS_WAIT}'`));
      try {
        // An expired key is forgotten, as if it had already been purged.
        await tx
          .delete(idempotencyKey)
          .where(
            and(
              eq(idempotencyKey.userId, claim.user.userId),
              eq(idempotencyKey.key, claim.key),
              sql`${idempotencyKey.expiresAt} <= now()`,
            ),
          );
        const inserted = await tx
          .insert(idempotencyKey)
          .values({
            tenantId: claim.user.tenantId,
            userId: claim.user.userId,
            key: claim.key,
            method: claim.method,
            path: claim.path,
            requestHash: claim.hash,
            status: 'IN_PROGRESS',
            expiresAt: sql`now() + make_interval(hours => ${IDEMPOTENCY_KEY_LIFETIME_HOURS})`,
          })
          .onConflictDoNothing({ target: [idempotencyKey.userId, idempotencyKey.key] })
          .returning({ id: idempotencyKey.id });
        if (inserted.length > 0) return null;
        const [row] = await tx
          .select()
          .from(idempotencyKey)
          .where(
            and(eq(idempotencyKey.userId, claim.user.userId), eq(idempotencyKey.key, claim.key)),
          );
        return row ?? null;
      } catch (error) {
        if (postgresCode(error) === LOCK_NOT_AVAILABLE) {
          throw new AppError('IDEMPOTENCY_IN_PROGRESS');
        }
        throw error;
      } finally {
        await tx.execute(sql`SET LOCAL lock_timeout = DEFAULT`).catch(() => undefined);
      }
    });
    if (!existing) return null;
    if (existing.requestHash !== claim.hash) throw new AppError('IDEMPOTENCY_KEY_REUSED');
    // Only committed keys are visible to other requests, and they are always completed.
    return existing;
  }

  private async complete(claim: Claim, result: unknown): Promise<void> {
    await this.inScope(claim.user, (tx) =>
      tx
        .update(idempotencyKey)
        .set({
          status: 'COMPLETED',
          responseStatus: claim.status,
          responseBody: result === undefined ? null : (result as object),
        })
        .where(
          and(eq(idempotencyKey.userId, claim.user.userId), eq(idempotencyKey.key, claim.key)),
        ),
    );
  }
}

/** SQLSTATE of a PostgreSQL error, whether or not Drizzle wrapped it. */
function postgresCode(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  const code = candidate.cause?.code ?? candidate.code;
  return typeof code === 'string' ? code : undefined;
}

interface Claim {
  user: RequestUser;
  key: string;
  method: string;
  path: string;
  hash: string;
  status: number;
}
