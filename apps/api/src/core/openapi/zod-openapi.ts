import { z } from 'zod';

/**
 * Converts a Zod schema into an OpenAPI 3.0 schema object for @nestjs/swagger decorators,
 * so that validation and documentation come from the same definition.
 * Usage: `@ApiOkResponse({ schema: toOpenApiSchema(responseSchema) })`.
 */
export function toOpenApiSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' });
}
