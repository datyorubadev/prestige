import { useState, useMemo, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export type ColumnDef<T = any, V = any> = {
  id?: string;
  key?: string;
  accessorKey?: string;
  header?: any;
  cell?: any;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
};

export type Column<T> = ColumnDef<T>;

export function CellMain({
  main,
  sub,
  primary,
  secondary,
  badge,
}: {
  main?: ReactNode;
  sub?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  badge?: ReactNode;
}) {
  const title = main ?? primary;
  const subtitle = sub ?? secondary;
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col">
        <span className="font-semibold text-text">{title}</span>
        {subtitle && <span className="text-[11px] text-text-3">{subtitle}</span>}
      </div>
      {badge}
    </div>
  );
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId?: (row: T, index: number) => string;
  hoverable?: boolean;
  borderless?: boolean;
  onRowClick?: (row: T) => void;
  searchKey?: keyof T | ((row: T) => string);
  searchPlaceholder?: string;
  pageSize?: number;
  emptyText?: string;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: ReactNode;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  getRowId,
  hoverable = true,
  borderless = false,
  onRowClick,
  searchKey,
  searchPlaceholder = "Search records...",
  pageSize = 10,
  emptyText = "No data available",
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  emptyAction,
  className,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const getColKey = (col: ColumnDef<T>): string =>
    (col.key || col.accessorKey || col.id || (typeof col.header === "string" ? col.header : "col")) as string;

  const renderColHeader = (col: ColumnDef<T>) => {
    if (col.header === "" || col.header === null) return "";
    if (!col.header) {
      const colId = col.id || col.accessorKey || "";
      if (colId.toLowerCase().includes("action")) return "";
      return colId;
    }
    if (typeof col.header === "function") return col.header({ column: col });
    return col.header;
  };

  const renderCell = (col: ColumnDef<T>, row: T) => {
    if (col.render) return col.render(row);
    if (col.cell) {
      if (typeof col.cell === "function") {
        const k = getColKey(col);
        return col.cell({ row: { original: row }, getValue: () => row[k] });
      }
      return col.cell;
    }
    const k = getColKey(col);
    return row[k] ?? "—";
  };

  const filteredData = useMemo(() => {
    if (!search.trim() || !searchKey) return data;
    const q = search.toLowerCase();
    return data.filter((row) => {
      const val = typeof searchKey === "function" ? searchKey(row) : String(row[searchKey] ?? "");
      return val.toLowerCase().includes(q);
    });
  }, [data, search, searchKey]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const comp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? comp : -comp;
    });
  }, [filteredData, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        !borderless && "rounded-xl border border-border bg-surface shadow-xs",
        className,
      )}
    >
      {searchKey && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
          <div className="relative flex-1 max-w-xs">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-3 outline-none focus:border-primary-border"
            />
          </div>
          <span className="text-[11.5px] text-text-3 font-medium">
            Showing {sortedData.length} records
          </span>
        </div>
      )}

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-[12.5px]">
          <thead className="border-b border-border bg-surface-2/60 text-text-2 font-medium uppercase text-[12px] tracking-wide">
            <tr>
              {columns.map((col, i) => {
                const k = getColKey(col) || `col-${i}`;
                return (
                  <th
                    key={k}
                    style={{ width: col.width }}
                    className={cn(
                      "px-4 py-2.5 select-none",
                      col.sortable && "cursor-pointer hover:text-text transition-colors",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                    onClick={() => col.sortable && toggleSort(k)}
                  >
                    <div
                      className={cn(
                        "inline-flex items-center gap-1",
                        col.align === "right" && "justify-end w-full",
                        col.align === "center" && "justify-center w-full",
                      )}
                    >
                      <span>{renderColHeader(col)}</span>
                      {col.sortable && sortKey === k && (
                        <Icon
                          name="chevron-down"
                          size={12}
                          className={cn("transition-transform", sortDir === "desc" && "rotate-180")}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pagedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <EmptyState
                    icon={emptyIcon ?? "inbox"}
                    title={emptyTitle ?? (emptyText && emptyText !== "No data available" ? emptyText : "Nothing here yet")}
                    subtitle={emptySubtitle ?? "No records found in this view."}
                    action={emptyAction}
                    className="min-h-[160px] py-4 my-0"
                  />
                </td>
              </tr>
            ) : (
              pagedData.map((row, idx) => {
                const rowKey = getRowId ? getRowId(row, idx) : (row.id ?? idx);
                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={cn(
                      "transition-colors duration-150",
                      hoverable && "hover:bg-surface-2/50",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {columns.map((col, i) => {
                      const k = getColKey(col) || `col-${i}`;
                      return (
                        <td
                          key={k}
                          className={cn(
                            "px-4 py-2.5 text-text",
                            col.align === "right" && "text-right",
                            col.align === "center" && "text-center",
                          )}
                        >
                          {renderCell(col, row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[12px] text-text-2">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
