import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FormGrid, SearchSelect } from "@/components/erp/FormBits";
import { MasterDataDialog } from "@/components/erp/MasterDataDialog";
import { PageHeader, PageBody, Panel } from "@/components/erp/Page";
import { DataTable } from "@/components/erp/DataTable";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { useErp } from "@/lib/erp/store";
import { stockRows, stockOf } from "@/lib/erp/ledger";
import { aed, fmtDate, fmtDateTime, qty as fq, today } from "@/lib/erp/format";
import { toast } from "sonner";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";
import {
  purchaseTotal,
  salesTotal,
  paidFor,
  invoiceStatus,
  supplierBalance,
  customerBalance,
  docTotals,
} from "@/lib/erp/calc";

export const Route = createFileRoute("/inventory/finished-goods")({
  head: () => ({
    meta: [
      { title: "Finished Goods Inventory | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Combined finished goods inventory, valuation and location stock.",
      },
      { property: "og:title", content: "Finished Goods Inventory | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Combined finished goods inventory, valuation and location stock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FinishedGoods,
});

function FinishedGoods() {
  const { db, ledger, update, can, refreshFromBackend, branch } = useErp();
  const [existingOpen, setExistingOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("L-FGW");
  const [quantity, setQuantity] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rowToRemove, setRowToRemove] = useState<{
    itemId: string;
    locationId: string;
    name: string;
    location: string;
    qty: number;
  } | null>(null);
  const addExistingStock = async () => {
    if (!can("stock_adjustments")) return toast.error("Permission denied");
    if (!productId || !locationId || quantity <= 0)
      return toast.error("Product, location and positive quantity are required");
    const product = db.products.find((p) => p.id === productId);
    setSaving(true);
    try {
      if (getApiTokens().access) {
        await apiJson(API_ENDPOINTS.openingFinishedGoods, {
          method: "POST",
          idempotent: true,
          body: JSON.stringify({
            finished_product: productId,
            location: locationId,
            quantity,
          }),
        });
        await refreshFromBackend();
      } else {
        update((d) => {
          const n = (d.counters.ADJ = (d.counters.ADJ ?? 0) + 1);
          d.stockAdjustments.unshift({
            id: "ADJ-FG-" + Date.now(),
            no: "ADJ-24" + String(n).padStart(4, "0"),
            date: today(),
            locationId,
            itemId: productId,
            itemType: "FG",
            batch: "",
            qty: quantity,
            reason: "Opening / externally produced finished goods",
            status: "Posted",
            createdBy: "User",
          });
        });
      }
      toast.success("Existing finished goods added", {
        description: `${quantity} ${product?.salesUnit ?? "units"} added to inventory.`,
      });
      setExistingOpen(false);
      setProductId("");
      setQuantity(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add finished goods");
    } finally {
      setSaving(false);
    }
  };
  const rows = useMemo(
    () =>
      stockRows(ledger)
        .filter(
          (r) =>
            r.itemType === "FG" &&
            Math.abs(r.qty) > 0.001 &&
            (branch === "ALL" || r.locationId === branch),
        )
        .map((r) => {
          const p = db.products.find((x) => x.id === r.itemId);
          return {
            ...r,
            code: p?.code ?? "",
            name: p?.name ?? "",
            location: db.locations.find((l) => l.id === r.locationId)?.name ?? "",
            unitCost: r.qty ? r.value / r.qty : 0,
            state: r.qty <= 0 ? "Out of Stock" : p && r.qty <= p.minStock ? "Low" : "Good",
          };
        }),
    [db, ledger, branch],
  );
  const removeInventoryRow = async (reason: string) => {
    if (!rowToRemove || removing) return;
    if (!can("stock_adjustments")) return toast.error("Permission denied");
    setRemoving(true);
    try {
      if (getApiTokens().access) {
        await apiJson(API_ENDPOINTS.clearFinishedGoods, {
          method: "POST",
          idempotent: true,
          body: JSON.stringify({
            finished_product: rowToRemove.itemId,
            location: rowToRemove.locationId,
            reason,
          }),
        });
        await refreshFromBackend();
      } else {
        update((d) => {
          const n = (d.counters.ADJ = (d.counters.ADJ ?? 0) + 1);
          d.stockAdjustments.unshift({
            id: "ADJ-FG-CLEAR-" + Date.now(),
            no: "ADJ-24" + String(n).padStart(4, "0"),
            date: today(),
            locationId: rowToRemove.locationId,
            itemId: rowToRemove.itemId,
            itemType: "FG",
            batch: "",
            qty: -rowToRemove.qty,
            reason: `Inventory row removed: ${reason}`,
            status: "Posted",
            createdBy: "User",
          });
        });
      }
      toast.success("Inventory row removed");
      setRowToRemove(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove inventory row");
    } finally {
      setRemoving(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Finished Goods Inventory"
        subtitle="Combined product balances and valuation by location"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!can("stock_adjustments")}
              onClick={() => setExistingOpen(true)}
            >
              <PackagePlus className="mr-1 h-3.5 w-3.5" />
              Add Existing Stock
            </Button>
            <Button size="sm" asChild>
              <Link to="/production/batches" search={{ new: 1 }}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                New Production Run
              </Link>
            </Button>
          </div>
        }
      />
      <Dialog open={existingOpen} onOpenChange={setExistingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Existing Finished Goods</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Record goods made before using this ERP or received from outside production.
          </p>
          <FormGrid cols={2}>
            <Field label="Finished Product" required>
              <div className="flex gap-2">
                <SearchSelect
                  options={db.products
                    .filter((p) => p.active)
                    .map((p) => ({ value: p.id, label: p.name, hint: p.code }))}
                  value={productId}
                  onChange={setProductId}
                  placeholder="Select a product..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setProductOpen(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> New product
                </Button>
              </div>
            </Field>
            <Field label="Finished Goods Location" required>
              <SearchSelect
                options={db.locations
                  .filter((l) => l.active && l.type === "fg_warehouse")
                  .map((l) => ({ value: l.id, label: l.name }))}
                value={locationId}
                onChange={setLocationId}
              />
            </Field>
            <Field label="Quantity" required>
              <Input
                type="number"
                min="0"
                className="h-8 text-right text-[13px]"
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </Field>
          </FormGrid>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setExistingOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void addExistingStock()}>
              {saving ? "Adding…" : "Add to Inventory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MasterDataDialog kind="product" open={productOpen} onOpenChange={setProductOpen} />
      <ConfirmDialog
        open={rowToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removing) setRowToRemove(null);
        }}
        title="Remove inventory row?"
        description={
          <>
            This will remove all <strong>{fq(rowToRemove?.qty ?? 0)}</strong> units of{" "}
            {rowToRemove?.name || "this product"} from {rowToRemove?.location}. The stock ledger
            history will be preserved.
          </>
        }
        confirmLabel={removing ? "Removing..." : "Remove stock"}
        destructive
        onConfirm={(reason) => void removeInventoryRow(reason)}
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.itemId + r.locationId}
            exportName="finished-goods-inventory"
            pageSize={14}
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Product" },
              { key: "location", header: "Location" },
              {
                key: "qty",
                header: "Available",
                align: "right",
                render: (r) => fq(r.qty),
                value: (r) => r.qty,
              },
              {
                key: "unitCost",
                header: "Unit Cost",
                align: "right",
                render: (r) => aed(r.unitCost),
                value: (r) => r.unitCost,
              },
              {
                key: "value",
                header: "Total Value",
                align: "right",
                render: (r) => aed(r.value),
                value: (r) => r.value,
              },
              {
                key: "state",
                header: "Status",
                render: (r) => <StatusBadge status={r.state} />,
                value: (r) => r.state,
              },
              {
                key: "actions",
                header: "Actions",
                align: "right",
                sortable: false,
                render: (r) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={!can("stock_adjustments")}
                    aria-label={`Remove ${r.name} inventory`}
                    onClick={() => setRowToRemove(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ),
                value: () => "",
              },
            ]}
          />
        </Panel>
      </PageBody>
    </>
  );
}
