import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCSV } from "@/lib/erp/format";
import { cn } from "@/lib/utils";
import { useErp } from "@/lib/erp/store";
import type { Database } from "@/lib/erp/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "sonner";
import {
  backendCollectionWritable,
  createBackendRecord,
  deleteBackendRecord,
  removeRecordReferences,
  updateBackendRecord,
} from "@/lib/erp/backend";
import { getApiTokens } from "@/lib/api";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  width?: string;
  hideOnMobile?: boolean;
  sortable?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  filters?: ReactNode;
  pageSize?: number;
  emptyTitle?: string;
  emptyHint?: string;
  exportName?: string;
  dense?: boolean;
  mobileCard?: (row: T) => ReactNode;
  collection?: Exclude<keyof Database, "counters">;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  searchPlaceholder = "Search…",
  toolbar,
  filters,
  pageSize = 12,
  emptyTitle = "No records found",
  emptyHint = "Adjust your filters or create a new record to get started.",
  exportName = "export",
  mobileCard,
  collection,
}: Props<T>) {
  const { db, update, refreshFromBackend, user } = useErp();
  const apiMode = Boolean(getApiTokens().access);
  const apiWritable = Boolean(collection && backendCollectionWritable(collection));
  const writable = Boolean(collection && user?.role !== "View only");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null);
  const [importing, setImporting] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const beginEdit = (row: T) => {
    setEditing(row);
    setEditData(structuredClone(row as Record<string, unknown>));
  };

  const recordLabel = (row: T | null) => {
    const value = (row ?? {}) as Record<string, unknown>;
    return String(value.no || value.name || value.code || value.id || "record");
  };

  const saveEdit = async () => {
    if (!collection || !editing) return;
    try {
      if (!editData) return;
      const next = editData;
      const original = editing as Record<string, unknown>;
      if (next.id !== original.id) throw new Error("The record ID cannot be changed.");
      if (apiMode) {
        await updateBackendRecord(collection, String(original.id), next, db);
        await refreshFromBackend();
        setEditing(null);
        toast.success("Record saved to the backend");
        return;
      }
      const committed = update(
        (draft) => {
          removeRecordReferences(draft, collection, String(original.id));
          const records = draft[collection];
          if (!Array.isArray(records)) return;
          const index = records.findIndex((item: { id?: string }) => item.id === original.id);
          if (index >= 0) (records as unknown[])[index] = next;
        },
        {
          action: "Edit",
          module: String(collection),
          recordType: String(collection),
          recordNo: recordLabel(editing),
          description: `Edited ${recordLabel(editing)}`,
        },
      );
      if (!committed) throw new Error("The change could not be saved.");
      setEditing(null);
      toast.success("Record saved to the database");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enter valid record data.");
    }
  };

  const fieldLabel = (key: string) =>
    key
      .replace(/Id$/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (letter) => letter.toUpperCase());

  const hiddenFields = new Set([
    "id",
    "createdAt",
    "createdBy",
    "total",
    "paid",
    "outstanding",
    "display",
  ]);
  const optionsFor = (key: string) => {
    const available = <T extends { active?: boolean; status?: unknown }>(items: T[]) =>
      items.filter(
        (item) => item.active !== false && String(item.status ?? "").toLowerCase() !== "inactive",
      );
    const map: Record<string, { id: string; name: string }[]> = {
      supplierId: available(db.suppliers),
      customerId: available(db.customers),
      warehouseId: available(db.locations),
      locationId: available(db.locations),
      openingLocationId: available(db.locations),
      productionLocationId: available(db.locations),
      fgLocationId: available(db.locations),
      fromId: available(db.locations),
      toId: available(db.locations),
      branchId: available(db.locations),
      categoryId: available(db.categories),
      productId: available(db.products),
      recipeId: available(db.recipes).map((item) => ({ id: item.id, name: item.no })),
      invoiceId: [...db.purchaseInvoices, ...db.salesInvoices].map((item) => ({
        id: item.id,
        name: item.no,
      })),
      batchId: db.productionBatches.map((item) => ({ id: item.id, name: item.no })),
      itemId: [...available(db.rawMaterials), ...available(db.products)],
    };
    return map[key];
  };

  const setEditField = (key: string, value: unknown) =>
    setEditData((current) => (current ? { ...current, [key]: value } : current));

  const setLineField = (key: string, index: number, field: string, value: unknown) =>
    setEditData((current) => {
      if (!current || !Array.isArray(current[key])) return current;
      const lines = structuredClone(current[key]) as Record<string, unknown>[];
      lines[index] = { ...lines[index], [field]: value };
      return { ...current, [key]: lines };
    });

  const renderField = (key: string, value: unknown, onChange: (value: unknown) => void) => {
    const options = optionsFor(key);
    if (options)
      return (
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select...</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      );
    if (key === "kind")
      return (
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="RM">Raw Material</option>
          <option value="FG">Finished Goods</option>
        </select>
      );
    if (key === "status")
      return (
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {[
            "Draft",
            "Submitted",
            "Approved",
            "Posted",
            "Planned",
            "In Progress",
            "Completed",
            "Dispatched",
            "In Transit",
            "Received",
            "Active",
            "Inactive",
            "Cancelled",
          ].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      );
    if (typeof value === "boolean")
      return (
        <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
          <input
            type="checkbox"
            checked={value}
            onChange={(event) => onChange(event.target.checked)}
          />
          {value ? "Active" : "Inactive"}
        </label>
      );
    if (["notes", "address", "reason", "remarks"].includes(key))
      return (
        <Textarea value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
      );
    const isDate = /date$/i.test(key);
    return (
      <Input
        type={typeof value === "number" ? "number" : isDate ? "date" : "text"}
        value={String(value ?? "")}
        onChange={(event) =>
          onChange(typeof value === "number" ? Number(event.target.value) : event.target.value)
        }
      />
    );
  };

  const deleteRecord = async () => {
    if (!collection || !deleting) return;
    const target = deleting as Record<string, unknown>;
    try {
      if (apiMode) {
        await deleteBackendRecord(collection, String(target.id));
        await refreshFromBackend();
        setDeleting(null);
        toast.success("Record deleted from the backend");
        return;
      }
      const committed = update(
        (draft) => {
          const records = draft[collection];
          if (!Array.isArray(records)) return;
          (draft as unknown as Record<string, unknown>)[collection] = records.filter(
            (item: { id?: string }) => item.id !== target.id,
          );
        },
        {
          action: "Delete",
          module: String(collection),
          recordType: String(collection),
          recordNo: recordLabel(deleting),
          description: `Deleted ${recordLabel(deleting)}`,
        },
      );
      if (!committed) throw new Error("The record could not be deleted.");
      setDeleting(null);
      toast.success("Record deleted from the database");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The record could not be deleted.");
    }
  };

  const val = useCallback(
    (row: T, c: Column<T>) =>
      c.value ? c.value(row) : (((row as Record<string, unknown>)[c.key] as string | number) ?? ""),
    [],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // A referenced backend record is archived instead of cascaded. Keep it in
    // the database for historical lookups, but remove it from its own table.
    let r = collection
      ? rows.filter((row) => {
          const record = row as Record<string, unknown>;
          return (
            record.active !== false && String(record.status ?? "").toLowerCase() !== "inactive"
          );
        })
      : rows;
    if (needle)
      r = r.filter((row) =>
        columns.some((c) => String(val(row, c)).toLowerCase().includes(needle)),
      );
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col)
        r = [...r].sort((a, b) => {
          const x = val(a, col);
          const y = val(b, col);
          if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
          return String(x).localeCompare(String(y)) * sort.dir;
        });
    }
    return r;
  }, [rows, q, sort, columns, collection, val]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const actionColumn: Column<T> | null = collection
    ? {
        key: "__actions",
        header: "Actions",
        sortable: false,
        align: "right",
        width: "92px",
        render: (row) => (
          <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Edit ${recordLabel(row)}`}
              disabled={!writable || (apiMode && !apiWritable)}
              onClick={() => beginEdit(row)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              aria-label={`Delete ${recordLabel(row)}`}
              disabled={!writable || (apiMode && !apiWritable)}
              onClick={() => setDeleting(row)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
        value: () => "",
      }
    : null;
  const allColumns = actionColumn ? [...columns, actionColumn] : columns;
  const visible = allColumns.filter((c) => !hidden.includes(c.key));

  const doExport = () => {
    downloadCSV(`${exportName}-${new Date().toISOString().slice(0, 10)}.csv`, [
      visible.map((c) => c.header),
      ...filtered.map((row) => visible.map((c) => String(val(row, c)))),
    ]);
  };

  const doTemplate = async () => {
    try {
      const { downloadExcelTemplate } = await import("@/lib/erp/excel");
      await downloadExcelTemplate(exportName, collection, rows, columns);
      toast.success("Excel template downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the Excel template.");
    }
  };

  const doImport = async (file: File) => {
    if (!collection || importing) return;
    if (!writable) {
      toast.error("View-only access cannot upload records");
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    if (apiMode && !apiWritable) {
      toast.error("Excel import is not supported for this backend table");
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    setImporting(true);
    try {
      const { readExcelRecords } = await import("@/lib/erp/excel");
      const imported = await readExcelRecords(file, collection, rows);
      if (apiMode) {
        for (const record of imported) {
          await createBackendRecord(collection, record as Record<string, unknown>, db);
        }
        await refreshFromBackend();
        setPage(1);
        toast.success(`${imported.length} record${imported.length === 1 ? "" : "s"} imported`, {
          description: "Imported records were saved through the backend API.",
        });
        return;
      }
      const existingIds = new Set(
        rows.map((row) => String((row as Record<string, unknown>).id ?? "")),
      );
      const duplicate = imported.find((row) =>
        existingIds.has(String((row as Record<string, unknown>).id ?? "")),
      );
      if (duplicate)
        throw new Error(
          `A record with ID ${String((duplicate as Record<string, unknown>).id)} already exists.`,
        );
      const committed = update(
        (draft) => {
          const target = draft[collection];
          if (!Array.isArray(target)) throw new Error("This page cannot accept imported records.");
          (draft as unknown as Record<string, unknown>)[collection] = [...imported, ...target];
        },
        {
          action: "Excel Import",
          module: String(collection),
          recordType: String(collection),
          recordNo: file.name,
          description: `Imported ${imported.length} record${imported.length === 1 ? "" : "s"} from Excel`,
        },
      );
      if (!committed) throw new Error("The imported records could not be saved.");
      setPage(1);
      toast.success(`${imported.length} record${imported.length === 1 ? "" : "s"} imported`, {
        description: "Blank text fields were stored as -.",
      });
    } catch (error) {
      toast.error("Excel upload failed", {
        description: error instanceof Error ? error.message : "Check the template and try again.",
      });
    } finally {
      setImporting(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between">
        <div className="relative min-w-0 sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            aria-label="Search records"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {filters}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[13px]"
            onClick={() => void doTemplate()}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />{" "}
            <span className="hidden xl:inline">Template</span>
          </Button>
          {collection && (
            <>
              <input
                ref={uploadRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void doImport(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-[13px]"
                disabled={importing || !writable}
                onClick={() => uploadRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />{" "}
                <span className="hidden xl:inline">
                  {importing ? "Uploading…" : "Upload Excel"}
                </span>
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]">
                <Columns3 className="h-3.5 w-3.5" />{" "}
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {allColumns
                .filter((c) => c.key !== "__actions")
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!hidden.includes(c.key)}
                    onCheckedChange={(v) =>
                      setHidden((h) => (v ? h.filter((k) => k !== c.key) : [...h, c.key]))
                    }
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[13px]"
            onClick={doExport}
          >
            <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Export</span>
          </Button>
          {toolbar}
        </div>
      </div>

      {slice.length === 0 ? (
        <div className="rounded-md border border-dashed bg-surface px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <>
          {mobileCard && (
            <div className="space-y-2 md:hidden">
              {slice.map((row) => (
                <button
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className="block w-full rounded-md border bg-surface p-3 text-left shadow-card"
                >
                  {mobileCard(row)}
                </button>
              ))}
            </div>
          )}
          <div className={cn("erp-table-wrap max-h-[70vh]", mobileCard && "hidden md:block")}>
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-muted">
                <tr>
                  {visible.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: c.width }}
                      className={cn(
                        "whitespace-nowrap border-b px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                        c.align !== "right" && c.align !== "center" && "text-left",
                        c.hideOnMobile && "hidden lg:table-cell",
                      )}
                    >
                      {c.sortable === false ? (
                        c.header
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() =>
                            setSort((s) =>
                              s && s.key === c.key
                                ? { key: c.key, dir: s.dir === 1 ? -1 : 1 }
                                : { key: c.key, dir: 1 },
                            )
                          }
                        >
                          {c.header}
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b last:border-0 hover:bg-accent/40",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {visible.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-1.5 align-middle",
                          c.align === "right" && "num",
                          c.align === "center" && "text-center",
                          c.hideOnMobile && "hidden lg:table-cell",
                        )}
                      >
                        {c.render ? c.render(row) : String(val(row, c))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : (current - 1) * pageSize + 1}–
          {Math.min(current * pageSize, filtered.length)} of {filtered.length} entries
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-2">
            Page {current} of {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            aria-label="Next page"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {recordLabel(editing)}</DialogTitle>
          </DialogHeader>
          {editData && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(editData)
                .filter(([key]) => !hiddenFields.has(key))
                .map(([key, value]) =>
                  Array.isArray(value) ? (
                    <div key={key} className="space-y-2 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label>{fieldLabel(key)}</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditField(key, [
                              ...value,
                              value[0]
                                ? Object.fromEntries(
                                    Object.keys(value[0]).map((field) => [
                                      field,
                                      typeof value[0][field] === "number" ? 0 : "",
                                    ]),
                                  )
                                : {},
                            ])
                          }
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add line
                        </Button>
                      </div>
                      {value.map((line: Record<string, unknown>, index: number) => (
                        <div
                          key={index}
                          className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-3"
                        >
                          {Object.entries(line).map(([field, fieldValue]) => (
                            <div key={field} className="space-y-1">
                              <Label className="text-xs">{fieldLabel(field)}</Label>
                              {renderField(field, fieldValue, (next) =>
                                setLineField(key, index, field, next),
                              )}
                            </div>
                          ))}
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              onClick={() =>
                                setEditField(
                                  key,
                                  value.filter((_, itemIndex) => itemIndex !== index),
                                )
                              }
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Remove line
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      key={key}
                      className={cn(
                        "space-y-1",
                        ["notes", "address", "reason", "remarks"].includes(key) && "sm:col-span-2",
                      )}
                    >
                      <Label>{fieldLabel(key)}</Label>
                      {renderField(key, value, (next) => setEditField(key, next))}
                    </div>
                  ),
                )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${recordLabel(deleting)}?`}
        description="This permanently removes the record from the shared ERP database."
        confirmLabel="Delete"
        destructive
        onConfirm={deleteRecord}
      />
    </div>
  );
}
