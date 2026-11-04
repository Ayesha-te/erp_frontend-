import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickCreate } from "@/components/erp/useQuickCreate";
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

export const Route = createFileRoute("/production/transfers")({
  head: () => ({
    meta: [
      { title: "Material Transfers | BakeHub" },
      {
        name: "description",
        content: "Issue raw materials from the warehouse to the production floor.",
      },
      { property: "og:title", content: "Material Transfers | BakeHub" },
      {
        property: "og:description",
        content: "Issue raw materials from the warehouse to the production floor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MaterialTransfers,
});

import { MaterialTransferDialog } from "@/components/erp/dialogs";
import { API_ENDPOINTS, apiJson } from "@/lib/api";
import { toast } from "sonner";

function MaterialTransfers() {
  const { db, can, branch, refreshFromBackend } = useErp();
  const [open, setOpen] = useQuickCreate();
  const [pendingId, setPendingId] = useState("");
  const act = async (
    id: string,
    action: "submit" | "approve" | "dispatch" | "receive" | "cancel",
  ) => {
    if (pendingId) return;
    setPendingId(id);
    try {
      const transfer = db.materialTransfers.find((x) => x.id === id);
      let body: BodyInit | undefined;
      if (action === "cancel")
        body = JSON.stringify({ reason: window.prompt("Cancellation reason") || "" });
      if (action === "receive")
        body = JSON.stringify({
          items: transfer?.lines.map((line) => {
            const remaining =
              (line.dispatchedQty ?? line.qty) - (line.receivedQty ?? 0) - (line.damagedQty ?? 0);
            return {
              id: line.id,
              received_quantity: Number(
                window.prompt(`Receive quantity (remaining ${remaining})`, String(remaining)) || 0,
              ),
              damaged_quantity: Number(window.prompt("Damaged quantity", "0") || 0),
            };
          }),
        });
      await apiJson(`${API_ENDPOINTS.materialTransfers}${id}/${action}/`, {
        method: "POST",
        idempotent: action === "dispatch" || action === "receive" || action === "cancel",
        body,
      });
      await refreshFromBackend();
      toast.success(`Transfer ${action} successful`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} transfer`);
    } finally {
      setPendingId("");
    }
  };
  return (
    <>
      <PageHeader
        title="Material Transfers"
        subtitle="Warehouse to production stock movements — no consumption, no accounting entries"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!can("material_transfers")}
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Transfer
          </Button>
        }
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={db.materialTransfers.filter(
              (r) => branch === "ALL" || r.fromId === branch || r.toId === branch,
            )}
            rowKey={(r) => r.id}
            exportName="material-transfers"
            collection="materialTransfers"
            columns={[
              { key: "no", header: "Transfer No." },
              { key: "date", header: "Date", render: (r) => fmtDate(r.date), value: (r) => r.date },
              {
                key: "from",
                header: "Source",
                value: (r) => db.locations.find((l) => l.id === r.fromId)?.name ?? "",
              },
              {
                key: "to",
                header: "Destination",
                value: (r) => db.locations.find((l) => l.id === r.toId)?.name ?? "",
              },
              { key: "items", header: "Lines", align: "right", value: (r) => r.lines.length },
              {
                key: "qty",
                header: "Total Qty",
                align: "right",
                render: (r) => fq(r.lines.reduce((s, l) => s + l.qty, 0)),
                value: (r) => r.lines.reduce((s, l) => s + l.qty, 0),
              },
              { key: "requestedBy", header: "Requested By", hideOnMobile: true },
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
                  <div className="flex flex-wrap gap-1">
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
                    {["Submitted", "Approved"].includes(r.status) ? (
                      <Button
                        size="sm"
                        disabled={!!pendingId}
                        onClick={() => act(r.id, "dispatch")}
                      >
                        Dispatch
                      </Button>
                    ) : null}
                    {["Dispatched", "Partially Received"].includes(r.status) ? (
                      <Button size="sm" disabled={!!pendingId} onClick={() => act(r.id, "receive")}>
                        Receive
                      </Button>
                    ) : null}
                    {!["Cancelled", "Received"].includes(r.status) ? (
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
      <MaterialTransferDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
