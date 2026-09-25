import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

// Pagination of every list (docs/API.md §1): ?page=1&pageSize=25 (at most 100).
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof paginationQuery>;

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

/** OpenAPI and validation schema of a page of items. */
export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    data: z.array(item),
    meta: z.object({ page: z.int(), pageSize: z.int(), total: z.int() }),
  });
}

export function offsetOf({ page, pageSize }: Pagination): number {
  return (page - 1) * pageSize;
}

/** Documents the pagination parameters of a list route in OpenAPI. */
export const ApiPageQuery = () =>
  applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      schema: { type: 'integer', minimum: 1, default: 1 },
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    }),
  );
