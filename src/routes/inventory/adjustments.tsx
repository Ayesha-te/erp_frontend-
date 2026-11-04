import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageBody, Panel } from "@/components/erp/Page";
import { DataTable } from "@/components/erp/DataTable";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { useErp } from "@/lib/erp/store";
import { stockRows, stockOf } from "@/lib/erp/ledger";
import { aed, fmtDate, fmtDateTime, qty as fq } from "@/lib/erp/format";
import {
  purchaseTotal,
  salesTotal,
  paidFor,
  invoiceStatus,
  supplierBalance,
  customerBalance,
  docTotals,
} from "@/lib/erp/calc";

export const Route = createFileRoute("/inventory/adjustments")({
  head: () => ({
    meta: [
      { title: "Stock Adjustments | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Post positive or negative stock adjustments with a full audit trail.",
      },
      { property: "og:title", content: "Stock Adjustments | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Post positive or negative stock adjustments with a full audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Adjustments,
});

import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field, FormGrid, SearchSelect } from "@/components/erp/FormBits";
import { today } from "@/lib/erp/format";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";

function Adjustments() {
  const { db, ledger, update, can, refreshFromBackend, branch } = useErp();
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState(
    () => db.locations.find((location) => location.type === "raw_warehouse")?.id ?? "",
  );
  const [q, setQ] = useState(0);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const items = [
    ...db.rawMaterials.map((r) => ({ value: r.id, label: r.name, hint: "RM" })),
    ...db.products.map((p) => ({ value: p.id, label: p.name, hint: "FG" })),
  ];

  const post = async () => {
    if (pending) return;
    if (!can("stock_adjustments")) return toast.error("Permission denied");
    if (!itemId || !locationId || !q || !reason.trim())
      return toast.error("Item, location, quantity and reason are required");
    const itemType = db.rawMaterials.some((r) => r.id === itemId) ? "RM" : "FG";
    const available = stockOf(ledger, itemId, locationId);
    if (q < 0 && -q > available)
      return toast.error("Insufficient stock", {
        description: `Only ${fq(available)} is available at this location.`,
      });
    try {
      setPending(true);
      if (getApiTokens().access) {
        const item =
          itemType === "RM"
            ? db.rawMaterials.find((x) => x.id === itemId)
            : db.products.find((x) => x.id === itemId);
        const unitCode =
          itemType === "RM"
            ? db.rawMaterials.find((x) => x.id === itemId)?.baseUnit
            : db.products.find((x) => x.id === itemId)?.salesUnit;
        await apiJson<{ id: string }>(API_ENDPOINTS.stockAdjustment, {
          method: "POST",
          body: JSON.stringify({
            raw_material: itemType === "RM" ? itemId : null,
            finished_product: itemType === "FG" ? itemId : null,
            location: locationId,
            quantity: Math.abs(q),
            direction: q > 0 ? "POSITIVE" : "NEGATIVE",
            unit: db.uoms.find((x) => x.code === unitCode)?.id,
            unit_cost: q > 0 ? (item?.standardCost ?? 0) : 0,
            adjustment_date: today(),
            reason,
          }),
        });
        await refreshFromBackend();
      } else {
        update(
          (d) => {
            const n = (d.counters.ADJ = (d.counters.ADJ ?? 0) + 1);
            d.stockAdjustments.unshift({
              id: "ADJ-N" + Date.now(),
              no: "ADJ-24" + String(n).padStart(4, "0"),
              date: today(),
              locationId,
              itemId,
              itemType,
              batch: "",
              qty: q,
              reason,
              status: "Posted",
              createdBy: "User",
            });
          },
          {
            action: "Stock Adjusted",
            module: "Inventory",
            recordType: "Stock Adjustment",
            recordNo: "New",
            newStatus: "Posted",
            description: reason,
          },
        );
      }
      toast.success(getApiTokens().access ? "Adjustment draft saved" : "Stock adjustment posted");
      setQ(0);
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post stock adjustment");
    } finally {
      setPending(false);
    }
  };
  const act = async (id: string, action: "submit" | "approve" | "post" | "cancel") => {
    if (pendingId) return;
    setPendingId(id);
    try {
      const body =
        action === "cancel"
          ? JSON.stringify({ reason: window.prompt("Cancellation reason") || "" })
          : undefined;
      await apiJson(`${API_ENDPOINTS.stockAdjustment}${id}/${action}/`, {
        method: "POST",
        idempotent: action === "post" || action === "cancel",
        body,
      });
      await refreshFromBackend();
      toast.success(`Adjustment ${action} successful`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} adjustment`);
    } finally {
      setPendingId("");
    }
  };

  return (
    <>
      <PageHeader
        title="Stock Adjustments"
        subtitle="Corrections posted directly to the stock ledger"
      />
      <PageBody>
        <Panel title="New adjustment">
          <FormGrid cols={4}>
            <Field label="Item" required>
              <SearchSelect options={items} value={itemId} onChange={setItemId} />
            </Field>
            <Field label="Location" required>
              <SearchSelect
                options={db.locations
                  .filter((l) => l.type !== "virtual")
                  .map((l) => ({ value: l.id, label: l.name }))}
                value={locationId}
                onChange={setLocationId}
              />
            </Field>
            <Field label="Quantity (+/-)" required>
              <Input
                type="number"
                className="h-8 text-right text-[13px]"
                value={q || ""}
                onChange={(e) => setQ(Number(e.target.value))}
              />
            </Field>
            <Field label="Reason" required>
              <Input
                className="h-8 text-[13px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FormGrid>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={post} disabled={!can("stock_adjustments") || pending}>
              {pending ? "Saving…" : "Save Draft"}
            </Button>
          </div>
        </Panel>
        <Panel title="Posted adjustments" bodyClass="p-3">
          <DataTable
            rows={db.stockAdjustments.filter((r) => branch === "ALL" || r.locationId === branch)}
            rowKey={(r) => r.id}
            exportName="stock-adjustments"
            collection="stockAdjustments"
            emptyTitle="No adjustments posted"
            emptyHint="Adjustments you post appear here and in the stock ledger."
            columns={[
              { key: "no", header: "No." },
              { key: "date", header: "Date", render: (r) => fmtDate(r.date), value: (r) => r.date },
              {
                key: "item",
                header: "Item",
                value: (r) =>
                  (
                    db.rawMaterials.find((x) => x.id === r.itemId) ??
                    db.products.find((x) => x.id === r.itemId)
                  )?.name ?? "",
              },
              {
                key: "loc",
                header: "Location",
                value: (r) => db.locations.find((l) => l.id === r.locationId)?.name ?? "",
              },
              {
                key: "qty",
                header: "Qty",
                align: "right",
                render: (r) => fq(r.qty),
                value: (r) => r.qty,
              },
              { key: "reason", header: "Reason" },
              {
                key: "status",
                header: "Status",
                render: (r) => <StatusBadge status={r.status} />,
                value: (r) => r.status,
              },
              {
                key: "actions",
                header: "Actions",
                sortable: false,
                render: (r) => (
                  <div className="flex gap-1">
                    {r.status === "Draft" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!pendingId}
                        onClick={() => act(r.id, "submit")}
                      >
                        Submit
                      </Button>
                    ) : null}
                    {r.status === "Submitted" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!pendingId}
                        onClick={() => act(r.id, "approve")}
                      >
                        Approve
                      </Button>
                    ) : null}
                    {r.status === "Approved" ? (
                      <Button size="sm" disabled={!!pendingId} onClick={() => act(r.id, "post")}>
                        Post
                      </Button>
                    ) : null}
                    {["Draft", "Submitted", "Approved", "Posted"].includes(r.status) ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!!pendingId}
                        onClick={() => act(r.id, "cancel")}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      </PageBody>
    </>
  );
}
