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

export const Route = createFileRoute("/production/wastage")({
  head: () => ({
    meta: [
      { title: "Wastage | BakeHub" },
      {
        name: "description",
        content: "Record raw material and finished goods wastage with approval and ledger impact.",
      },
      { property: "og:title", content: "Wastage | BakeHub" },
      {
        property: "og:description",
        content: "Record raw material and finished goods wastage with approval and ledger impact.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WastagePage,
});

import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field, FormGrid, SearchSelect } from "@/components/erp/FormBits";
import { today } from "@/lib/erp/format";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";

function WastagePage() {
  const { db, ledger, update, can, branch, refreshFromBackend } = useErp();
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("L-PROD");
  const [q, setQ] = useState(0);
  const [type, setType] = useState("Raw Material");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const items = [
    ...db.rawMaterials.map((r) => ({ value: r.id, label: r.name, hint: "RM" })),
    ...db.products.map((p) => ({ value: p.id, label: p.name, hint: "FG" })),
  ];

  const post = async () => {
    if (pending) return;
    if (!can("wastage")) return toast.error("Permission denied");
    if (!itemId || q <= 0 || !reason.trim())
      return toast.error("Item, quantity and reason are required");
    const isRM = db.rawMaterials.some((r) => r.id === itemId);
    const available = stockOf(ledger, itemId, locationId);
    if (q > available)
      return toast.error("Insufficient stock", {
        description: `Only ${fq(available)} is available at this location.`,
      });
    try {
      setPending(true);
      if (getApiTokens().access) {
        const item = isRM
          ? db.rawMaterials.find((x) => x.id === itemId)
          : db.products.find((x) => x.id === itemId);
        const unitCode = isRM
          ? db.rawMaterials.find((x) => x.id === itemId)?.baseUnit
          : db.products.find((x) => x.id === itemId)?.salesUnit;
        await apiJson<{ id: string }>(API_ENDPOINTS.wastage, {
          method: "POST",
          body: JSON.stringify({
            raw_material: isRM ? itemId : null,
            finished_product: isRM ? null : itemId,
            location: locationId,
            quantity: q,
            unit: db.uoms.find((x) => x.code === unitCode)?.id,
            unit_cost: item?.standardCost ?? 0,
            wastage_date: today(),
            reason,
            notes: type,
          }),
        });
        await refreshFromBackend();
      } else
        update(
          (d) => {
            const n = (d.counters.WST = (d.counters.WST ?? 0) + 1);
            d.wastages.unshift({
              id: "W-N" + Date.now(),
              no: "WST-24" + String(n).padStart(4, "0"),
              date: today(),
              itemId,
              itemType: isRM ? "RM" : "FG",
              qty: q,
              unit: isRM ? "KG" : "PACK",
              locationId,
              wastageType: type,
              reason,
              approvedBy: "Faisal Omar",
              status: "Posted",
              createdBy: "User",
            });
          },
          {
            action: "Posted",
            module: "Production",
            recordType: "Wastage",
            recordNo: "New",
            newStatus: "Posted",
            description: reason,
          },
        );
      toast.success(getApiTokens().access ? "Wastage draft saved" : "Wastage posted");
      setQ(0);
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post wastage");
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
      await apiJson(`${API_ENDPOINTS.wastage}${id}/${action}/`, {
        method: "POST",
        idempotent: action === "post" || action === "cancel",
        body,
      });
      await refreshFromBackend();
      toast.success(`Wastage ${action} successful`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} wastage`);
    } finally {
      setPendingId("");
    }
  };

  return (
    <>
      <PageHeader
        title="Wastage"
        subtitle="Losses recorded against production and warehouse stock"
      />
      <PageBody>
        <Panel title="Record wastage">
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
            <Field label="Wastage Type" required>
              <SearchSelect
                options={[
                  "Raw Material",
                  "Finished Product",
                  "Packaging",
                  "Damage",
                  "Expiry",
                  "Quality Failure",
                ].map((t) => ({ value: t, label: t }))}
                value={type}
                onChange={setType}
              />
            </Field>
            <Field label="Quantity" required>
              <Input
                type="number"
                className="h-8 text-right text-[13px]"
                value={q || ""}
                onChange={(e) => setQ(Number(e.target.value))}
              />
            </Field>
            <Field label="Reason" required className="sm:col-span-2">
              <Input
                className="h-8 text-[13px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FormGrid>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={post} disabled={!can("wastage") || pending}>
              {pending ? "Saving…" : "Save Draft"}
            </Button>
          </div>
        </Panel>
        <Panel bodyClass="p-3">
          <DataTable
            rows={db.wastages.filter((r) => branch === "ALL" || r.locationId === branch)}
            rowKey={(r) => r.id}
            exportName="wastage"
            collection="wastages"
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
              { key: "itemType", header: "Type" },
              {
                key: "qty",
                header: "Qty",
                align: "right",
                render: (r) => `${fq(r.qty)} ${r.unit}`,
                value: (r) => r.qty,
              },
              {
                key: "loc",
                header: "Location",
                value: (r) => db.locations.find((l) => l.id === r.locationId)?.name ?? "",
              },
              { key: "wastageType", header: "Wastage Type", hideOnMobile: true },
              { key: "reason", header: "Reason", hideOnMobile: true },
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
