import { type ReactNode, useState } from "react";
import {
  type ColumnDef,
  type FilterFn,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  searchAccessor?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  searchAccessor,
  searchPlaceholder = "Search…",
  pageSize = 25,
  onRowClick,
  emptyMessage = "No data.",
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const customFilter: FilterFn<T> | undefined = searchAccessor
    ? (row, _columnId, filterValue) =>
        searchAccessor(row.original).toLowerCase().includes(String(filterValue).toLowerCase())
    : undefined;

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    globalFilterFn: customFilter ?? "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="text"
        placeholder={searchPlaceholder}
        value={globalFilter}
        onChange={(e) => {
          setGlobalFilter(e.target.value);
        }}
        className="max-w-xs"
      />
      <div className="border-border-soft overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-border bg-surface border-b">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="text-text-muted px-3 py-2 text-left font-semibold"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={cn(
                            "flex items-center gap-1",
                            canSort && "hover:text-text cursor-pointer",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!canSort}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-[0.6rem]">
                              {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                            </span>
                          )}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-text-dim px-3 py-4 text-center italic">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-border-soft border-b last:border-b-0",
                    onRowClick && "hover:bg-surface cursor-pointer",
                  )}
                  onClick={
                    onRowClick
                      ? () => {
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="text-text px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="text-text-muted flex items-center gap-3 text-xs">
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => {
              table.previousPage();
            }}
            disabled={!table.getCanPreviousPage()}
          >
            Prev
          </Button>
          <span>
            Page {pagination.pageIndex + 1} of {pageCount} ({rows.length} on this page)
          </span>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => {
              table.nextPage();
            }}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export function Cell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
