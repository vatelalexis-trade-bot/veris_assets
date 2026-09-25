'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Amounts and quantities are right-aligned with tabular figures. */
  numeric?: boolean;
  sortable?: boolean;
}

export interface DataTableSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
}

interface DataTableProps<Row> {
  /** Accessible description of the table, read by screen readers. */
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  loading?: boolean;
  emptyMessage?: string;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  pagination?: DataTablePagination;
  onPageChange?: (page: number) => void;
}

const LOADING_ROWS = 5;

/**
 * Presentational table: sorting and pagination are done by the API (SPEC §22.1, §25), so the
 * table only displays the current page and reports the user's choices to its parent.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowId,
  loading = false,
  emptyMessage,
  sort,
  onSortChange,
  pagination,
  onPageChange,
}: DataTableProps<Row>) {
  const t = useTranslations('dataTable');
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  function toggleSort(columnId: string) {
    const direction = sort?.columnId === columnId && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange?.({ columnId, direction });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm" aria-busy={loading || undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-raised text-left text-muted">
            <tr>
              {columns.map((column) => {
                const sorted = sort?.columnId === column.id ? sort.direction : undefined;
                const SortIcon =
                  sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                    className={cn('px-4 py-2.5 font-medium', column.numeric && 'text-right')}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        aria-label={t('sortBy', { column: column.header })}
                        className="inline-flex items-center gap-1 rounded hover:text-foreground"
                      >
                        {column.header}
                        <SortIcon aria-hidden="true" className="size-3.5" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: LOADING_ROWS }, (_, index) => (
                  <tr key={index} className="border-t border-border">
                    {columns.map((column) => (
                      <td key={column.id} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={getRowId(row)} className="border-t border-border hover:bg-surface">
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          'px-4 py-3 text-foreground',
                          column.numeric && 'text-right tabular-nums',
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
            {!loading && rows.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                  {emptyMessage ?? t('empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <div className="flex items-center justify-between gap-4 text-sm text-muted">
          <span>{t('rowCount', { total: pagination.total })}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('previousPage')}
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span>{t('pageInfo', { page: pagination.page, pageCount })}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('nextPage')}
              disabled={pagination.page >= pageCount}
              onClick={() => onPageChange?.(pagination.page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
