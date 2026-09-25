import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const IDEMPOTENT = 'virtus:idempotent';
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * The route requires an `Idempotency-Key` header (docs/ARCHITECTURE.md §4.8): repeating the same
 * request with the same key returns the first answer without doing the work again.
 */
export const Idempotent = () =>
  applyDecorators(
    SetMetadata(IDEMPOTENT, true),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      description:
        'UUID chosen by the client for this action. Repeating the request with the same key returns the first answer.',
      schema: { type: 'string', format: 'uuid' },
    }),
  );
