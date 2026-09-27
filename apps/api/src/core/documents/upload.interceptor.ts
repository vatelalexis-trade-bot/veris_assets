import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes } from '@nestjs/swagger';
import { MAX_DOCUMENT_SIZE_BYTES } from '@veris/shared';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { AppError } from '../errors/app-error.js';

export const UPLOAD = 'veris:upload';

const parse = multer({
  storage: multer.memoryStorage(),
  // One file of 10 MB at most (SPEC §16), plus a few text fields.
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES, files: 1, fields: 10, fieldSize: 10_000 },
}).single('file');

const received = new WeakSet<Request>();

/**
 * Receives one file (multipart field `file`) in memory, once per request, with the errors in the
 * standard format: a file over 10 MB gives FILE_TOO_LARGE.
 */
export async function receiveUpload(request: Request, response: Response): Promise<void> {
  if (received.has(request)) return;
  await new Promise<void>((resolve, reject) => {
    parse(request, response, (error: unknown) => {
      if (!error) return resolve();
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return reject(new AppError('FILE_TOO_LARGE', [{ code: 'MAX_10_MB', field: 'file' }]));
      }
      const code = error instanceof multer.MulterError ? error.code : 'INVALID_MULTIPART';
      reject(new AppError('VALIDATION_FAILED', [{ code, field: 'file' }]));
    });
  });
  received.add(request);
}

/** What identifies an upload request for the idempotency check: its fields and the file's hash. */
export function uploadFingerprint(request: Request): object {
  const file = (request as Request & { file?: { buffer: Buffer } }).file;
  return {
    fields: (request.body as object | undefined) ?? {},
    file: file ? createHash('sha256').update(file.buffer).digest('hex') : null,
  };
}

@Injectable()
export class UploadInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    await receiveUpload(http.getRequest<Request>(), http.getResponse<Response>());
    return next.handle();
  }
}

/** The route receives one file (multipart/form-data). */
export const Upload = () =>
  applyDecorators(
    SetMetadata(UPLOAD, true),
    UseInterceptors(UploadInterceptor),
    ApiConsumes('multipart/form-data'),
  );
