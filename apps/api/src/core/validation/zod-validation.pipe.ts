import type { PipeTransform } from '@nestjs/common';
import type { ErrorDetail } from '@virtus/shared';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/**
 * Validates and converts a request body, query or parameter with a Zod schema.
 * Usage: `@Body(new ZodValidationPipe(schema)) body: z.infer<typeof schema>`.
 * Unknown fields are rejected when the schema is strict (`z.strictObject`), which is the rule.
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const details: ErrorDetail[] = result.error.issues.map((issue) => ({
      code: issue.code.toUpperCase(),
      field: issue.path.length > 0 ? issue.path.join('.') : null,
      meta: { message: issue.message },
    }));
    throw new AppError('VALIDATION_FAILED', details);
  }
}
