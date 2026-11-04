import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FormGrid, SearchSelect, TotalsBox } from "./FormBits";
import { useErp } from "@/lib/erp/store";
import {
  docTotals,
  lineAmounts,
  returnableQty,
  salesTotal,
  purchaseTotal,
  paidFor,
} from "@/lib/erp/calc";
import { stockOf, stockRows } from "@/lib/erp/ledger";
import { aed, today, addDays, qty as fq } from "@/lib/erp/format";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";

const num = (v: string) => (v === "" ? 0 : Number(v));
const requestNo = (prefix: string) =>
  `${prefix}-${new Date().toISOString().replace(/\D/g, "").slice(2, 14)}`;
const unitId = (db: ReturnType<typeof useErp>["db"], codeOrId: string) =>
  db.uoms.find((unit) => unit.id === codeOrId || unit.code === codeOrId)?.id || codeOrId;
const discountAmount = (qty: number, rate: number, discountPct: number) =>
  (qty * rate * discountPct) / 100;

function DialogShell({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 border-b bg-surface px-5 py-3">
          <DialogTitle className="text-[16px]">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">{children}</div>
        <DialogFooter className="sticky bottom-0 gap-2 border-t bg-surface px-5 py-3">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="erp-table-wrap">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="bg-surface-muted">
          <tr>
            {head.map((h, i) => (
              <th
                key={h + i}
                className="whitespace-nowrap border-b px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ------------------------- Purchase Invoice ------------------------- */
export function PurchaseInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, update, can, refreshFromBackend } = useErp();
  const [supplierId, setSupplierId] = useState("");
  const [supInv, setSupInv] = useState("");
  const [date, setDate] = useState(today());
  const [due, setDue] = useState(addDays(today(), 15));
  const [warehouseId, setWarehouseId] = useState("L-RMW");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([
    { itemId: "", qty: 0, unit: "", rate: 0, discount: 0, taxRate: 5 },
  ]);
  const totals = docTotals(lines);

  const reset = () => {
    setSupplierId("");
    setSupInv("");
    setNotes("");
    setLines([{ itemId: "", qty: 0, unit: "", rate: 0, discount: 0, taxRate: 5 }]);
  };

  const valid = () => {
    if (!supplierId) return "Select a supplier";
    const ok = lines.filter((l) => l.itemId && l.qty > 0);
    if (!ok.length) return "Add at least one material line with quantity";
    return null;
  };

  const save = async (status: "Draft" | "Posted") => {
    const err = valid();
    if (err) return toast.error("Cannot save invoice", { description: err });
    if (!can("purchasing")) return toast.error("Permission denied");
    const clean = lines.filter((l) => l.itemId && l.qty > 0);
    if (getApiTokens().access) {
      try {
        const invoice = await apiJson<{ id: string }>(API_ENDPOINTS.purchases, {
          method: "POST",
          body: JSON.stringify({
            invoice_number: requestNo("PI"),
            supplier: supplierId,
            supplier_invoice_number: supInv,
            invoice_date: date,
            due_date: due || null,
            warehouse: warehouseId,
            notes,
            items: clean.map((line) => ({
              raw_material: line.itemId,
              quantity: line.qty,
              unit: unitId(db, line.unit),
              purchase_rate: line.rate,
              discount_amount: discountAmount(line.qty, line.rate, line.discount),
              tax_rate: line.taxRate,
            })),
          }),
        });
        if (status === "Posted") {
          await apiJson(`${API_ENDPOINTS.purchases}${invoice.id}/post/`, {
            method: "POST",
            idempotent: true,
          });
        }
        await refreshFromBackend();
        toast.success(
          status === "Posted" ? "Purchase invoice posted successfully" : "Draft saved",
          {
            description:
              status === "Posted"
                ? "Raw material stock increased and supplier outstanding updated by the backend."
                : "Draft invoice saved in the backend.",
          },
        );
        reset();
        onOpenChange(false);
        return;
      } catch (error) {
        return toast.error(error instanceof Error ? error.message : "Could not save invoice");
      }
    }
    update(
      (d) => {
        const n = (d.counters.PI = (d.counters.PI ?? 0) + 1);
        d.purchaseInvoices.unshift({
          id: "PI-N" + Date.now(),
          no: "PI-24" + String(500 + n).padStart(4, "0"),
          supplierId,
          supplierInvNo: supInv,
          date,
          dueDate: due,
          warehouseId,
          paymentTerms: d.suppliers.find((s) => s.id === supplierId)?.paymentTerms ?? "30 Days",
          notes,
          lines: clean,
          status,
          createdBy: d.users.find((u) => u.role)?.name ?? "User",
          createdAt: new Date().toISOString(),
        });
      },
      {
        action: status === "Posted" ? "Posted" : "Created",
        module: "Purchasing",
        recordType: "Purchase Invoice",
        recordNo: "New",
        newStatus: status,
        description: `Purchase invoice ${status.toLowerCase()} for ${aed(totals.total)}`,
      },
    );
    toast.success(status === "Posted" ? "Purchase invoice posted successfully" : "Draft saved", {
      description:
        status === "Posted"
          ? "Raw material stock increased and supplier outstanding updated."
          : "Draft invoices do not affect inventory.",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="New Purchase Invoice"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={() => void save("Draft")}>
            Save Draft
          </Button>
          <Button size="sm" onClick={() => void save("Posted")}>
            Post Invoice
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Supplier" required>
          <SearchSelect
            options={db.suppliers.map((s) => ({ value: s.id, label: s.name, hint: s.code }))}
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Select supplier"
          />
        </Field>
        <Field label="Supplier Invoice No.">
          <Input
            className="h-8 text-[13px]"
            value={supInv}
            onChange={(e) => setSupInv(e.target.value)}
          />
        </Field>
        <Field label="Warehouse" required>
          <SearchSelect
            options={db.locations
              .filter((l) => l.type === "raw_warehouse")
              .map((l) => ({ value: l.id, label: l.name }))}
            value={warehouseId}
            onChange={setWarehouseId}
          />
        </Field>
        <Field label="Invoice Date" required>
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Due Date">
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <Input
            className="h-8 text-[13px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </FormGrid>

      <LineTable
        head={[
          "#",
          "Raw Material",
          "Unit",
          "Quantity",
          "Rate (AED)",
          "Disc %",
          "Tax %",
          "Tax Amt",
          "Line Total",
          "",
        ]}
      >
        {lines.map((l, i) => {
          const a = lineAmounts(l);
          return (
            <tr key={i} className="border-b last:border-0">
              <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
              <td className="px-2 py-1 min-w-[180px]">
                <SearchSelect
                  options={db.rawMaterials.map((r) => ({
                    value: r.id,
                    label: r.name,
                    hint: r.code,
                  }))}
                  value={l.itemId}
                  onChange={(v) => {
                    const rm = db.rawMaterials.find((r) => r.id === v)!;
                    setLines((ls) =>
                      ls.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              itemId: v,
                              unit: rm.baseUnit,
                              rate: rm.standardCost,
                              taxRate: rm.taxRate,
                            }
                          : x,
                      ),
                    );
                  }}
                />
              </td>
              <td className="px-2 py-1 text-muted-foreground">{l.unit || "—"}</td>
              {(["qty", "rate", "discount", "taxRate"] as const).map((k) => (
                <td key={k} className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-8 w-24 text-right text-[13px]"
                    value={l[k] || ""}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((x, j) => (j === i ? { ...x, [k]: num(e.target.value) } : x)),
                      )
                    }
                  />
                </td>
              ))}
              <td className="num px-2 py-1">{a.tax.toFixed(2)}</td>
              <td className="num px-2 py-1 font-medium">{a.total.toFixed(2)}</td>
              <td className="px-2 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Remove line"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </td>
            </tr>
          );
        })}
      </LineTable>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            setLines((l) => [
              ...l,
              { itemId: "", qty: 0, unit: "", rate: 0, discount: 0, taxRate: 5 },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </Button>
        <TotalsBox
          rows={[
            { label: "Subtotal", value: aed(totals.subtotal) },
            { label: "Discount", value: aed(totals.discount) },
            { label: "VAT", value: aed(totals.tax) },
          ]}
          grand={{ label: "Grand Total", value: aed(totals.total) }}
        />
      </div>
    </DialogShell>
  );
}

/* ------------------------- Material Transfer ------------------------- */
export function MaterialTransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, ledger, update, can, refreshFromBackend } = useErp();
  const [fromId, setFromId] = useState(
    () => db.locations.find((location) => location.type === "raw_warehouse")?.id ?? "",
  );
  const [toId, setToId] = useState(
    () => db.locations.find((location) => location.type === "production")?.id ?? "",
  );
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ itemId: "", qty: 0, unit: "" }]);

  const save = async () => {
    if (!can("material_transfers")) return toast.error("Permission denied");
    if (!fromId || !toId) return toast.error("Select a source warehouse and destination");
    if (fromId === toId) return toast.error("Source and destination cannot be the same");
    const clean = lines.filter((l) => l.itemId && l.qty > 0);
    if (!clean.length) return toast.error("Add at least one material line");
    for (const l of clean) {
      const avail = stockOf(ledger, l.itemId, fromId);
      if (l.qty > avail)
        return toast.error("Insufficient stock", {
          description: `${db.rawMaterials.find((r) => r.id === l.itemId)?.name}: only ${fq(avail)} available at source.`,
        });
    }
    if (getApiTokens().access) {
      try {
        await apiJson(API_ENDPOINTS.materialTransfers, {
          method: "POST",
          body: JSON.stringify({
            transfer_date: date,
            source_location: fromId,
            destination_location: toId,
            notes,
            items: clean.map((line) => ({
              raw_material: line.itemId,
              quantity: line.qty,
              unit: db.uoms.find((unit) => unit.code === line.unit)?.id,
            })),
          }),
        });
        await refreshFromBackend();
        toast.success("Material transfer completed");
        setLines([{ itemId: "", qty: 0, unit: "" }]);
        onOpenChange(false);
        return;
      } catch (error) {
        return toast.error(error instanceof Error ? error.message : "Could not save transfer");
      }
    }
    update(
      (d) => {
        const n = (d.counters.MT = (d.counters.MT ?? 0) + 1);
        d.materialTransfers.unshift({
          id: "MT-N" + Date.now(),
          no: "MT-24" + String(300 + n).padStart(4, "0"),
          date,
          fromId,
          toId,
          requestedBy: "Production",
          approvedBy: "Warehouse",
          notes,
          lines: clean,
          status: "Received",
          createdBy: "User",
        });
      },
      {
        action: "Dispatched",
        module: "Production",
        recordType: "Material Transfer",
        recordNo: "New",
        newStatus: "Received",
        description: "Materials issued to production",
      },
    );
    toast.success("Transfer dispatched", {
      description: "Source stock reduced and destination stock increased.",
    });
    setLines([{ itemId: "", qty: 0, unit: "" }]);
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="New Material Transfer"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Dispatch &amp; Receive
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Source Warehouse" required>
          <SearchSelect
            options={db.locations
              .filter((l) => l.type !== "virtual")
              .map((l) => ({ value: l.id, label: l.name }))}
            value={fromId}
            onChange={setFromId}
          />
        </Field>
        <Field label="Destination" required>
          <SearchSelect
            options={db.locations
              .filter((l) => l.type === "production")
              .map((l) => ({ value: l.id, label: l.name }))}
            value={toId}
            onChange={setToId}
          />
        </Field>
        <Field label="Transfer Date" required>
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input
            className="h-8 text-[13px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </FormGrid>
      <LineTable head={["#", "Raw Material", "Available", "Unit", "Transfer Qty", ""]}>
        {lines.map((l, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
            <td className="min-w-[200px] px-2 py-1">
              <SearchSelect
                options={db.rawMaterials.map((r) => ({ value: r.id, label: r.name, hint: r.code }))}
                value={l.itemId}
                onChange={(v) =>
                  setLines((ls) =>
                    ls.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            itemId: v,
                            unit: db.rawMaterials.find((r) => r.id === v)!.baseUnit,
                          }
                        : x,
                    ),
                  )
                }
              />
            </td>
            <td className="num px-2 py-1">
              {l.itemId ? fq(stockOf(ledger, l.itemId, fromId)) : "—"}
            </td>
            <td className="px-2 py-1 text-muted-foreground">{l.unit || "—"}</td>
            <td className="px-2 py-1">
              <Input
                type="number"
                className="h-8 w-28 text-right text-[13px]"
                value={l.qty || ""}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x, j) => (j === i ? { ...x, qty: num(e.target.value) } : x)),
                  )
                }
              />
            </td>
            <td className="px-2 py-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Remove line"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </td>
          </tr>
        ))}
      </LineTable>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setLines((l) => [...l, { itemId: "", qty: 0, unit: "" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add line
      </Button>
    </DialogShell>
  );
}

/* ------------------------- Production Batch ------------------------- */
export function ProductionBatchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, ledger, update, can, user, refreshFromBackend } = useErp();
  const [productId, setProductId] = useState("");
  const [plannedQty, setPlannedQty] = useState(500);
  const [producedQty, setProducedQty] = useState(500);
  const [actualMaterials, setActualMaterials] = useState<Record<string, number>>({});
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [date, setDate] = useState(today());
  const [remarks, setRemarks] = useState("");

  const productRecipes = useMemo(
    () => db.recipes.filter((r) => r.productId === productId && r.status === "Active"),
    [db.recipes, productId],
  );
  const recipe = productRecipes.find((r) => r.id === selectedRecipeId) ?? productRecipes[0];
  const product = db.products.find((p) => p.id === productId);
  const productionLocationId =
    db.locations.find((location) => location.type === "production")?.id || "L-PROD";
  const finishedGoodsLocationId =
    db.locations.find((location) => location.type === "fg_warehouse")?.id || "L-FGW";
  const factor = recipe ? producedQty / recipe.outputQty : 0;
  const rows = useMemo(
    () =>
      (recipe?.lines ?? []).map((l) => {
        const rm = db.rawMaterials.find((r) => r.id === l.itemId)!;
        const required = Math.round(l.qty * factor * (1 + l.wastagePct / 100) * 100) / 100;
        const actual = actualMaterials[l.itemId] ?? required;
        const available = stockOf(ledger, l.itemId, productionLocationId);
        return {
          rm,
          required,
          actual,
          available,
          shortage: Math.max(0, actual - available),
          cost: rm.standardCost,
        };
      }),
    [recipe, factor, ledger, db.rawMaterials, productionLocationId, actualMaterials],
  );
  const estCost = rows.reduce((s, r) => s + r.actual * r.cost, 0);

  useEffect(() => {
    if (!productRecipes.length) {
      setSelectedRecipeId("");
      return;
    }
    if (!productRecipes.some((r) => r.id === selectedRecipeId)) {
      setSelectedRecipeId(productRecipes[0].id);
    }
  }, [productRecipes, selectedRecipeId]);

  const complete = async () => {
    if (!can("production")) return toast.error("Permission denied");
    if (!recipe || !product) return toast.error("Select a product with an active recipe");
    if (plannedQty <= 0) return toast.error("Quantity must be greater than zero");
    if (producedQty <= 0) return toast.error("Actual produced quantity must be greater than zero");
    const short = rows.filter((r) => r.shortage > 0);
    if (short.length && user?.role !== "Administrator" && user?.role !== "Manager")
      return toast.error("Insufficient production stock", {
        description: `${short.map((s) => s.rm.name).join(", ")} short. A manager override is required.`,
      });
    if (getApiTokens().access) {
      if (!productionLocationId || !finishedGoodsLocationId) {
        return toast.error("Production and finished goods locations must exist in the backend");
      }
      try {
        const batchNo =
          product.code.replace("FG-", "B") +
          date.replace(/-/g, "").slice(2) +
          String(Date.now()).slice(-2);
        const batch = await apiJson<{ id: string }>(API_ENDPOINTS.productionBatches, {
          method: "POST",
          body: JSON.stringify({
            production_number: requestNo("PRD"),
            finished_product: productId,
            recipe: recipe.id,
            planned_quantity: plannedQty,
            actual_produced_quantity: producedQty,
            production_location: productionLocationId,
            finished_goods_destination: finishedGoodsLocationId,
            batch_number: batchNo,
            manufacturing_date: date,
            expiry_date: addDays(date, product.shelfLifeDays),
            supervisor: null,
            remarks,
          }),
        });
        await apiJson(`${API_ENDPOINTS.productionBatches}${batch.id}/complete/`, {
          method: "POST",
          idempotent: true,
          body: JSON.stringify({
            actual_quantity: producedQty,
            materials: rows.map((r) => ({
              raw_material: r.rm.id,
              actual_consumed_quantity: r.actual,
            })),
          }),
        });
        await refreshFromBackend();
        toast.success("Production completed", {
          description: `${producedQty} packs added to finished goods by the backend.`,
        });
        onOpenChange(false);
        return;
      } catch (error) {
        return toast.error(
          error instanceof Error ? error.message : "Could not complete production",
        );
      }
    }
    update(
      (d) => {
        const n = (d.counters.PRD = (d.counters.PRD ?? 0) + 1);
        const batchNo =
          product.code.replace("FG-", "B") + date.replace(/-/g, "").slice(2) + String(n).slice(-2);
        d.productionBatches.unshift({
          id: "PB-N" + Date.now(),
          no: "PRD-24" + String(n).padStart(4, "0"),
          productId,
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          plannedQty,
          producedQty,
          batchNo,
          date,
          expiryDate: addDays(date, product.shelfLifeDays),
          productionLocationId,
          fgLocationId: finishedGoodsLocationId,
          supervisor: "Rashid Ali",
          remarks,
          materials: rows.map((r) => ({
            itemId: r.rm.id,
            stdQty: r.required,
            actualQty: r.actual,
            unitCost: r.cost,
          })),
          status: "Completed",
          createdBy: "User",
        });
      },
      {
        action: "Completed",
        module: "Production",
        recordType: "Production Batch",
        recordNo: "New",
        newStatus: "Completed",
        description: `Produced ${producedQty} ${product.salesUnit} of ${product.name}`,
      },
    );
    toast.success("Production completed", {
      description: `${producedQty} packs added to finished goods at ${aed(estCost / producedQty)} per unit.`,
    });
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="New Production Run"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void complete()}>
            Complete Production
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Finished Product" required>
          <SearchSelect
            options={db.products.map((p) => ({ value: p.id, label: p.name, hint: p.code }))}
            value={productId}
            onChange={(value) => {
              setProductId(value);
              setSelectedRecipeId("");
              setActualMaterials({});
            }}
          />
        </Field>
        <Field label="Recipe">
          <Select
            value={recipe?.id ?? ""}
            onValueChange={(value) => {
              setSelectedRecipeId(value);
              setActualMaterials({});
            }}
            disabled={!productRecipes.length}
          >
            <SelectTrigger className="h-8 bg-surface-muted text-[13px]">
              <SelectValue placeholder="No active recipes" />
            </SelectTrigger>
            <SelectContent>
              {productRecipes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.no} ({r.version})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Planned Quantity (packs)" required>
          <Input
            type="number"
            className="h-8 text-[13px]"
            value={plannedQty || ""}
            onChange={(e) => {
              const value = num(e.target.value);
              setPlannedQty(value);
              setProducedQty(value);
            }}
          />
        </Field>
        <Field label="Actual Produced Qty" required>
          <Input
            type="number"
            className="h-8 text-[13px]"
            value={producedQty || ""}
            onChange={(e) => setProducedQty(num(e.target.value))}
          />
        </Field>
        <Field label="Remarks">
          <Input
            className="h-8 text-[13px]"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </Field>
      </FormGrid>
      {recipe ? (
        <>
          <LineTable
            head={[
              "Raw Material",
              "Required Qty",
              "Actual Used Qty",
              "Available in Production",
              "Shortage",
              "Unit Cost",
              "Total Cost",
            ]}
          >
            {rows.map((r) => (
              <tr key={r.rm.id} className="border-b last:border-0">
                <td className="px-2 py-1">{r.rm.name}</td>
                <td className="num px-2 py-1">
                  {fq(r.required)} {r.rm.baseUnit}
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-8 w-28 text-right text-[13px]"
                    value={r.actual}
                    onChange={(e) =>
                      setActualMaterials((current) => ({
                        ...current,
                        [r.rm.id]: num(e.target.value),
                      }))
                    }
                  />
                </td>
                <td className="num px-2 py-1">{fq(r.available)}</td>
                <td
                  className={
                    "num px-2 py-1 " + (r.shortage > 0 ? "text-destructive font-medium" : "")
                  }
                >
                  {fq(r.shortage)}
                </td>
                <td className="num px-2 py-1">{r.cost.toFixed(2)}</td>
                <td className="num px-2 py-1 font-medium">{(r.actual * r.cost).toFixed(2)}</td>
              </tr>
            ))}
          </LineTable>
          <div className="flex justify-end">
            <TotalsBox
              rows={[
                { label: "Total material cost", value: aed(estCost) },
                { label: "Output quantity", value: `${fq(producedQty)} packs` },
              ]}
              grand={{
                label: "Cost per pack",
                value: aed(producedQty ? estCost / producedQty : 0),
              }}
            />
          </div>
        </>
      ) : (
        <p className="rounded-md border border-dashed bg-surface-muted px-4 py-8 text-center text-[13px] text-muted-foreground">
          Select a finished product to load its active recipe and scale material requirements.
        </p>
      )}
    </DialogShell>
  );
}

/* ------------------------- Stock Transfer (FG) ------------------------- */
export function StockTransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, ledger, update, can, refreshFromBackend } = useErp();
  const [fromId, setFromId] = useState("L-FGW");
  const [toId, setToId] = useState("L-DXB");
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState([{ itemId: "", batch: "", qty: 0 }]);
  const avail = useMemo(
    () => stockRows(ledger).filter((r) => r.itemType === "FG" && r.qty > 0),
    [ledger],
  );

  const save = async () => {
    if (!can("stock_transfers")) return toast.error("Permission denied");
    if (fromId === toId) return toast.error("Source and destination cannot be the same");
    const clean = lines.filter((l) => l.itemId && l.qty > 0);
    if (!clean.length) return toast.error("Add at least one product line");
    for (const l of clean) {
      const have = stockOf(ledger, l.itemId, fromId);
      if (l.qty > have)
        return toast.error("Insufficient stock", {
          description: `Only ${fq(have)} available at the source location.`,
        });
    }
    if (getApiTokens().access) {
      try {
        await apiJson(API_ENDPOINTS.finishedGoodsTransfers, {
          method: "POST",
          body: JSON.stringify({
            transfer_date: date,
            source_location: fromId,
            destination_location: toId,
            expected_receipt_date: addDays(date, 1),
            items: clean.map((line) => ({
              finished_product: line.itemId,
              requested_quantity: line.qty,
              unit: db.products.find((product) => product.id === line.itemId)?.salesUnit
                ? db.uoms.find(
                    (unit) =>
                      unit.code ===
                      db.products.find((product) => product.id === line.itemId)?.salesUnit,
                  )?.id
                : undefined,
            })),
          }),
        });
        await refreshFromBackend();
        toast.success("Finished-goods transfer completed");
        setLines([{ itemId: "", batch: "", qty: 0 }]);
        onOpenChange(false);
        return;
      } catch (error) {
        return toast.error(error instanceof Error ? error.message : "Could not save transfer");
      }
    }
    update(
      (d) => {
        const n = (d.counters.TR = (d.counters.TR ?? 0) + 1);
        d.stockTransfers.unshift({
          id: "ST-N" + Date.now(),
          no: "TR-24" + String(200 + n).padStart(4, "0"),
          date,
          fromId,
          toId,
          dispatchDate: date,
          expectedDate: addDays(date, 1),
          requestedBy: "Sales",
          dispatchedBy: "Warehouse",
          lines: clean.map((l) => ({ ...l })),
          status: "In Transit",
          createdBy: "User",
        });
      },
      {
        action: "Submitted",
        module: "Inventory",
        recordType: "Stock Transfer",
        recordNo: "New",
        newStatus: "In Transit",
        description: "Finished goods dispatched between locations",
      },
    );
    toast.success("Transfer dispatched", {
      description: "Stock moved to In Transit. Receive it at the destination to complete.",
    });
    setLines([{ itemId: "", batch: "", qty: 0 }]);
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="New Finished Goods Transfer"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Dispatch
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Source Location" required>
          <SearchSelect
            options={db.locations
              .filter((l) => l.type !== "virtual" && l.type !== "raw_warehouse")
              .map((l) => ({ value: l.id, label: l.name }))}
            value={fromId}
            onChange={setFromId}
          />
        </Field>
        <Field label="Destination Location" required>
          <SearchSelect
            options={db.locations
              .filter((l) => l.type !== "virtual" && l.type !== "raw_warehouse")
              .map((l) => ({ value: l.id, label: l.name }))}
            value={toId}
            onChange={setToId}
          />
        </Field>
        <Field label="Transfer Date" required>
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </FormGrid>
      <LineTable head={["#", "Product", "Available", "Transfer Qty", ""]}>
        {lines.map((l, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
            <td className="min-w-[260px] px-2 py-1">
              <SearchSelect
                options={avail
                  .filter((r) => r.locationId === fromId)
                  .map((r) => ({
                    value: r.itemId,
                    label: db.products.find((p) => p.id === r.itemId)?.name ?? "",
                    hint: fq(r.qty),
                  }))}
                value={l.itemId}
                onChange={(itemId) =>
                  setLines((ls) => ls.map((x, j) => (j === i ? { ...x, itemId, batch: "" } : x)))
                }
              />
            </td>
            <td className="num px-2 py-1">
              {l.itemId ? fq(stockOf(ledger, l.itemId, fromId)) : "—"}
            </td>
            <td className="px-2 py-1">
              <Input
                type="number"
                className="h-8 w-28 text-right text-[13px]"
                value={l.qty || ""}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x, j) => (j === i ? { ...x, qty: num(e.target.value) } : x)),
                  )
                }
              />
            </td>
            <td className="px-2 py-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Remove line"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </td>
          </tr>
        ))}
      </LineTable>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setLines((l) => [...l, { itemId: "", batch: "", qty: 0 }])}
      >
        <Plus className="h-3.5 w-3.5" /> Add line
      </Button>
    </DialogShell>
  );
}

/* ------------------------- Sales Invoice ------------------------- */
export function SalesInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, ledger, update, can, refreshFromBackend } = useErp();
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState(
    () =>
      db.locations.find(
        (location) =>
          location.active && ["branch", "shop", "van", "fg_warehouse"].includes(location.type),
      )?.id ?? "",
  );
  const [date, setDate] = useState(today());
  const [due, setDue] = useState(addDays(today(), 15));
  const [lines, setLines] = useState([
    { itemId: "", batch: "", qty: 0, price: 0, discount: 0, taxRate: 5, cost: 0 },
  ]);
  const totals = docTotals(lines);
  const cogs = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const revenue = totals.subtotal - totals.discount;
  const avail = useMemo(
    () => stockRows(ledger).filter((r) => r.itemType === "FG" && r.qty > 0),
    [ledger],
  );

  const save = async (status: "Draft" | "Posted") => {
    if (!can("sales")) return toast.error("Permission denied");
    if (!customerId) return toast.error("Select a customer");
    if (!locationId) return toast.error("Select a sales location");
    const clean = lines.filter((l) => l.itemId && l.qty > 0);
    if (!clean.length) return toast.error("Add at least one product line");
    if (status === "Posted")
      for (const l of clean) {
        const have = stockOf(ledger, l.itemId, locationId);
        if (l.qty > have)
          return toast.error("Insufficient stock", {
            description: `Only ${fq(have)} available at the selected location.`,
          });
      }
    if (getApiTokens().access) {
      try {
        const invoice = await apiJson<{ id: string }>(API_ENDPOINTS.salesInvoices, {
          method: "POST",
          body: JSON.stringify({
            invoice_number: requestNo("SI"),
            customer: customerId,
            invoice_date: date,
            due_date: due || null,
            sales_location: locationId,
            payment_terms: db.customers.find((c) => c.id === customerId)?.paymentTerms ?? "",
            salesperson: null,
            notes: "",
            items: clean.map((line) => ({
              finished_product: line.itemId,
              batch: line.batch,
              quantity: line.qty,
              unit: unitId(
                db,
                db.products.find((product) => product.id === line.itemId)?.salesUnit ?? "",
              ),
              selling_price: line.price,
              discount_amount: discountAmount(line.qty, line.price, line.discount),
              tax_rate: line.taxRate,
            })),
          }),
        });
        if (status === "Posted") {
          await apiJson(`${API_ENDPOINTS.salesInvoices}${invoice.id}/post/`, {
            method: "POST",
            idempotent: true,
          });
        }
        await refreshFromBackend();
        toast.success(status === "Posted" ? "Sales invoice posted successfully" : "Draft saved", {
          description:
            status === "Posted"
              ? "Stock and customer receivable were updated by the backend."
              : "Draft invoice saved in the backend.",
        });
        setLines([{ itemId: "", batch: "", qty: 0, price: 0, discount: 0, taxRate: 5, cost: 0 }]);
        onOpenChange(false);
        return;
      } catch (error) {
        return toast.error(error instanceof Error ? error.message : "Could not save sales invoice");
      }
    }
    update(
      (d) => {
        const n = (d.counters.SI = (d.counters.SI ?? 0) + 1);
        d.salesInvoices.unshift({
          id: "SI-N" + Date.now(),
          no: "SI-24" + String(600 + n).padStart(4, "0"),
          customerId,
          date,
          dueDate: due,
          locationId,
          paymentTerms: d.customers.find((c) => c.id === customerId)?.paymentTerms ?? "15 Days",
          salesperson: "Leena Fahad",
          lines: clean,
          status,
          createdBy: "User",
        });
      },
      {
        action: status === "Posted" ? "Posted" : "Created",
        module: "Sales",
        recordType: "Sales Invoice",
        recordNo: "New",
        newStatus: status,
        description: `Sales invoice ${status.toLowerCase()} for ${aed(totals.total)}`,
      },
    );
    toast.success(status === "Posted" ? "Sales invoice posted successfully" : "Draft saved", {
      description:
        status === "Posted"
          ? "Stock reduced at the selling location and receivable created."
          : "Draft invoices do not affect inventory.",
    });
    setLines([{ itemId: "", batch: "", qty: 0, price: 0, discount: 0, taxRate: 5, cost: 0 }]);
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="New Sales Invoice"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={() => void save("Draft")}>
            Save Draft
          </Button>
          <Button size="sm" onClick={() => void save("Posted")}>
            Post Invoice
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Customer" required>
          <SearchSelect
            options={db.customers.map((c) => ({ value: c.id, label: c.name, hint: c.code }))}
            value={customerId}
            onChange={setCustomerId}
          />
        </Field>
        <Field label="Sales Location" required>
          <SearchSelect
            options={db.locations
              .filter((l) => l.active && ["branch", "shop", "van", "fg_warehouse"].includes(l.type))
              .map((l) => ({ value: l.id, label: l.name }))}
            value={locationId}
            onChange={setLocationId}
          />
        </Field>
        <Field label="Invoice Date" required>
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Due Date">
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
      </FormGrid>
      <LineTable
        head={["#", "Product", "Available", "Qty", "Price", "Disc %", "Tax %", "Line Total", ""]}
      >
        {lines.map((l, i) => {
          const a = lineAmounts(l);
          return (
            <tr key={i} className="border-b last:border-0">
              <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
              <td className="min-w-[240px] px-2 py-1">
                <SearchSelect
                  options={db.products
                    .filter((product) => product.active)
                    .map((product) => ({
                      value: product.id,
                      label: product.name,
                      hint: `${fq(stockOf(ledger, product.id, locationId))} available`,
                    }))}
                  value={l.itemId}
                  onChange={(itemId) => {
                    const p = db.products.find((x) => x.id === itemId)!;
                    const balance = avail.find(
                      (row) => row.itemId === itemId && row.locationId === locationId,
                    );
                    const cost =
                      balance && balance.qty > 0 ? balance.value / balance.qty : p.standardCost;
                    setLines((ls) =>
                      ls.map((x, j) =>
                        j === i
                          ? { ...x, itemId, batch: "", price: p.price, cost, taxRate: p.taxRate }
                          : x,
                      ),
                    );
                  }}
                />
              </td>
              <td className="num px-2 py-1">
                {l.itemId ? fq(stockOf(ledger, l.itemId, locationId)) : "—"}
              </td>
              {(["qty", "price", "discount", "taxRate"] as const).map((k) => (
                <td key={k} className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-8 w-20 text-right text-[13px]"
                    value={l[k] || ""}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((x, j) => (j === i ? { ...x, [k]: num(e.target.value) } : x)),
                      )
                    }
                  />
                </td>
              ))}
              <td className="num px-2 py-1 font-medium">{a.total.toFixed(2)}</td>
              <td className="px-2 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Remove line"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </td>
            </tr>
          );
        })}
      </LineTable>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            setLines((l) => [
              ...l,
              { itemId: "", batch: "", qty: 0, price: 0, discount: 0, taxRate: 5, cost: 0 },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </Button>
        <TotalsBox
          rows={[
            { label: "Subtotal", value: aed(totals.subtotal) },
            { label: "Discount", value: aed(totals.discount) },
            { label: "VAT", value: aed(totals.tax) },
            { label: "Cost of goods sold", value: aed(cogs) },
            {
              label: "Gross profit",
              value: `${aed(revenue - cogs)} (${revenue ? (((revenue - cogs) / revenue) * 100).toFixed(1) : "0.0"}%)`,
            },
          ]}
          grand={{ label: "Grand Total", value: aed(totals.total) }}
        />
      </div>
    </DialogShell>
  );
}

/* ------------------------- Sales Return ------------------------- */
export function SalesReturnDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, update, can, refreshFromBackend } = useErp();
  const [invoiceId, setInvoiceId] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [conds, setConds] = useState<Record<string, string>>({});
  const inv = db.salesInvoices.find((i) => i.id === invoiceId);

  const save = async () => {
    if (!can("sales_returns")) return toast.error("Permission denied");
    if (!inv) return toast.error("Select the original sales invoice");
    if (!reason.trim()) return toast.error("Return reason is required");
    const lines = inv.lines
      .map((l) => ({ l, q: qtys[l.itemId] ?? 0 }))
      .filter((x) => x.q > 0)
      .map((x) => {
        const r = returnableQty(db, inv.id, x.l.itemId) as { remaining: number };
        return { ...x, remaining: r.remaining };
      });
    if (!lines.length) return toast.error("Enter at least one return quantity");
    const bad = lines.find((x) => x.q > x.remaining);
    if (bad)
      return toast.error("Returned quantity cannot exceed sold quantity", {
        description: `Only ${fq(bad.remaining)} remaining returnable.`,
      });
    if (getApiTokens().access) {
      try {
        await apiJson(API_ENDPOINTS.salesReturns, {
          method: "POST",
          body: JSON.stringify({
            original_sales_invoice: inv.id,
            return_date: date,
            return_location: inv.locationId,
            reason,
            items: lines.map((x) => ({
              original_sales_invoice_item: (x.l as typeof x.l & { id?: string }).id,
              return_quantity: x.q,
              condition: (conds[x.l.itemId] ?? "Saleable").toUpperCase().replace(" ", "_"),
            })),
          }),
        });
        await refreshFromBackend();
        toast.success("Sales return draft saved");
        setQtys({});
        onOpenChange(false);
        return;
      } catch (error) {
        return toast.error(error instanceof Error ? error.message : "Could not save sales return");
      }
    }
    update(
      (d) => {
        const n = (d.counters.SR = (d.counters.SR ?? 0) + 1);
        d.salesReturns.unshift({
          id: "SR-N" + Date.now(),
          no: "SR-24" + String(100 + n).padStart(4, "0"),
          customerId: inv.customerId,
          invoiceId: inv.id,
          date,
          locationId: inv.locationId,
          reason,
          lines: lines.map((x) => ({
            itemId: x.l.itemId,
            batch: "",
            qty: x.q,
            condition: (conds[x.l.itemId] ?? "Saleable") as
              "Saleable" | "Damaged" | "Expired" | "Quality Issue",
            amount: x.q * x.l.price * (1 + x.l.taxRate / 100),
          })),
          status: "Posted",
          createdBy: "User",
        });
      },
      {
        action: "Posted",
        module: "Sales",
        recordType: "Sales Return",
        recordNo: "New",
        newStatus: "Posted",
        description: `Return booked against ${inv.no}`,
      },
    );
    toast.success("Sales return posted", {
      description: "Saleable stock returned to inventory and customer outstanding reduced.",
    });
    setQtys({});
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="New Sales Return"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Post Return
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Original Sales Invoice" required>
          <SearchSelect
            options={db.salesInvoices
              .filter((i) => i.status !== "Draft" && i.status !== "Cancelled")
              .slice(0, 60)
              .map((i) => ({
                value: i.id,
                label: `${i.no} — ${db.customers.find((c) => c.id === i.customerId)?.name}`,
                hint: i.date,
              }))}
            value={invoiceId}
            onChange={setInvoiceId}
          />
        </Field>
        <Field label="Return Date" required>
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Return Reason" required>
          <Input
            className="h-8 text-[13px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Damaged in transit"
          />
        </Field>
      </FormGrid>
      {inv && (
        <LineTable
          head={["Product", "Sold", "Already Returned", "Remaining", "Return Qty", "Condition"]}
        >
          {inv.lines.map((l) => {
            const r = returnableQty(db, inv.id, l.itemId) as {
              sold: number;
              returned: number;
              remaining: number;
            };
            return (
              <tr key={l.itemId} className="border-b last:border-0">
                <td className="px-2 py-1">{db.products.find((p) => p.id === l.itemId)?.name}</td>
                <td className="num px-2 py-1">{fq(r.sold)}</td>
                <td className="num px-2 py-1">{fq(r.returned)}</td>
                <td className="num px-2 py-1 font-medium">{fq(r.remaining)}</td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-8 w-24 text-right text-[13px]"
                    value={qtys[l.itemId] || ""}
                    onChange={(e) => setQtys((q) => ({ ...q, [l.itemId]: num(e.target.value) }))}
                  />
                </td>
                <td className="px-2 py-1">
                  <SearchSelect
                    className="w-40"
                    options={["Saleable", "Damaged", "Expired", "Quality Issue"].map((c) => ({
                      value: c,
                      label: c,
                    }))}
                    value={conds[l.itemId] ?? "Saleable"}
                    onChange={(v) => setConds((c) => ({ ...c, [l.itemId]: v }))}
                  />
                </td>
              </tr>
            );
          })}
        </LineTable>
      )}
    </DialogShell>
  );
}

/* ------------------------- Payments ------------------------- */
export function PaymentDialog({
  open,
  onOpenChange,
  kind,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "supplier" | "customer";
}) {
  const { db, update, can, refreshFromBackend } = useErp();
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  const parties = kind === "supplier" ? db.suppliers : db.customers;
  const invoices = (
    kind === "supplier"
      ? db.purchaseInvoices.filter((i) => i.supplierId === partyId)
      : db.salesInvoices.filter((i) => i.customerId === partyId)
  ).filter((i) => i.status !== "Draft" && i.status !== "Cancelled");

  const save = async () => {
    if (!can(kind === "supplier" ? "supplier_payments" : "customer_payments"))
      return toast.error("Permission denied");
    if (!partyId) return toast.error("Select a party");
    if (amount <= 0) return toast.error("Amount must be greater than zero");
    const allocated = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);
    if (allocated > amount + 0.01) return toast.error("Allocated amount exceeds payment amount");
    if (allocated <= 0) return toast.error("Allocate the payment to at least one invoice");
    if (pending) return;
    if (getApiTokens().access) {
      const paymentMethod = db.paymentMethods.find(
        (entry) => entry.name === method || entry.id === method,
      );
      if (!paymentMethod) return toast.error("Select a valid payment method");
      setPending(true);
      try {
        const endpoint =
          kind === "supplier" ? API_ENDPOINTS.supplierPayments : API_ENDPOINTS.customerPayments;
        const payment = await apiJson<{ id: string }>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            [kind === "supplier" ? "supplier" : "customer"]: partyId,
            payment_date: date,
            amount,
            payment_method: paymentMethod.id,
            reference_number: reference,
            notes,
            allocations: Object.entries(alloc)
              .filter(([, value]) => value > 0)
              .map(([invoice, allocationAmount]) => ({ invoice, amount: allocationAmount })),
          }),
        });
        await apiJson(`${endpoint}${payment.id}/post/`, { method: "POST", idempotent: true });
        await refreshFromBackend();
        setAlloc({});
        setAmount(0);
        onOpenChange(false);
        toast.success("Payment posted", {
          description: "Invoice allocations and ledger were updated by the backend.",
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not post payment");
      } finally {
        setPending(false);
      }
      return;
    }
    update(
      (d) => {
        const key = kind === "supplier" ? "SPY" : "CPY";
        const n = (d.counters[key] = (d.counters[key] ?? 0) + 1);
        const rec = {
          id: (kind === "supplier" ? "SP-N" : "CP-N") + Date.now(),
          no: `${key}-24${String(100 + n).padStart(4, "0")}`,
          partyId,
          date,
          amount,
          method,
          reference,
          account: "Emirates NBD - Current",
          allocations: Object.entries(alloc)
            .filter(([, v]) => v > 0)
            .map(([invoiceId, a]) => ({ invoiceId, amount: a })),
          notes,
          createdBy: "User",
          status: "Posted" as const,
        };
        if (kind === "supplier") d.supplierPayments.unshift(rec);
        else d.customerPayments.unshift(rec);
      },
      {
        action: "Payment Recorded",
        module: kind === "supplier" ? "Purchasing" : "Sales",
        recordType: "Payment",
        recordNo: "New",
        newStatus: "Posted",
        description: `${aed(amount)} payment recorded`,
      },
    );
    toast.success("Payment recorded", {
      description: "Ledger and invoice outstanding balances updated.",
    });
    setAlloc({});
    setAmount(0);
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "supplier" ? "New Supplier Payment" : "New Customer Payment"}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Posting…" : "Record Payment"}
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label={kind === "supplier" ? "Supplier" : "Customer"} required>
          <SearchSelect
            options={parties.map((p) => ({ value: p.id, label: p.name, hint: p.code }))}
            value={partyId}
            onChange={setPartyId}
          />
        </Field>
        <Field label="Payment Date" required>
          <Input
            type="date"
            className="h-8 text-[13px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Amount (AED)" required>
          <Input
            type="number"
            className="h-8 text-right text-[13px]"
            value={amount || ""}
            onChange={(e) => setAmount(num(e.target.value))}
          />
        </Field>
        <Field label="Payment Method">
          <SearchSelect
            options={db.paymentMethods.map((m) => ({ value: m.name, label: m.name }))}
            value={method}
            onChange={setMethod}
          />
        </Field>
        <Field label="Reference Number">
          <Input
            className="h-8 text-[13px]"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <Textarea
            className="min-h-8 text-[13px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </FormGrid>
      {partyId && (
        <LineTable head={["Invoice", "Date", "Total", "Paid", "Outstanding", "Allocate"]}>
          {invoices.map((i) => {
            const total = kind === "supplier" ? purchaseTotal(i as never) : salesTotal(i as never);
            const paid = paidFor(db, kind === "supplier" ? "purchase" : "sales", i.id);
            return (
              <tr key={i.id} className="border-b last:border-0">
                <td className="px-2 py-1 font-medium">{i.no}</td>
                <td className="px-2 py-1">{i.date}</td>
                <td className="num px-2 py-1">{total.toFixed(2)}</td>
                <td className="num px-2 py-1">{paid.toFixed(2)}</td>
                <td className="num px-2 py-1">{(total - paid).toFixed(2)}</td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-8 w-28 text-right text-[13px]"
                    value={alloc[i.id] || ""}
                    onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: num(e.target.value) }))}
                  />
                </td>
              </tr>
            );
          })}
        </LineTable>
      )}
    </DialogShell>
  );
}
