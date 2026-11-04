import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useQuickCreate } from "@/components/erp/useQuickCreate";
import { PageHeader, PageBody, Panel } from "@/components/erp/Page";
import { DataTable } from "@/components/erp/DataTable";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { StockTransferDialog } from "@/components/erp/dialogs";
import { useErp } from "@/lib/erp/store";
import { fmtDate, qty as fq, today } from "@/lib/erp/format";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";

export const Route = createFileRoute("/stock-transfers")({
  head: () => ({
    meta: [
      { title: "Stock Transfers | Zekra Sweets ERP" },
      {
        name: "description",
        content:
          "Dispatch and receive finished goods between warehouses, branches, shops and vans.",
      },
      { property: "og:title", content: "Stock Transfers | Zekra Sweets ERP" },
      {
        property: "og:description",
        content:
          "Dispatch and receive finished goods between warehouses, branches, shops and vans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockTransfers,
});

function StockTransfers() {
  const { db, can, canManage, update, branch, refreshFromBackend } = useErp();
  const [open, setOpen] = useQuickCreate();
  const [pendingId, setPendingId] = useState("");
  const act = async (
    id: string,
    action: "submit" | "approve" | "dispatch" | "receive" | "cancel",
  ) => {
    if (pendingId) return;
    if (!can("stock_transfers")) return toast.error("Permission denied");
    try {
      setPendingId(id);
      const transfer = db.stockTransfers.find((x) => x.id === id);
      if (!transfer) return;
      if (getApiTokens().access) {
        await apiJson(`${API_ENDPOINTS.finishedGoodsTransfers}${id}/${action}/`, {
          method: "POST",
          idempotent: action === "dispatch" || action === "receive" || action === "cancel",
          body:
            action === "receive"
              ? JSON.stringify({
                  items: transfer.lines.map((line) => ({
                    id: line.id,
                    received_quantity: Number(
                      window.prompt(
                        "Received quantity",
                        String(line.qty - (line.receivedQty ?? 0) - (line.damagedQty ?? 0)),
                      ) || 0,
                    ),
                    damaged_quantity: Number(window.prompt("Damaged quantity", "0") || 0),
                  })),
                })
              : action === "cancel"
                ? JSON.stringify({ reason: window.prompt("Cancellation reason") || "" })
                : undefined,
        });
        await refreshFromBackend();
      } else {
        update(
          (d) => {
            const t = d.stockTransfers.find((x) => x.id === id);
            if (!t) return;
            if (action === "submit") t.status = "Submitted";
            if (action === "approve") t.status = "Approved";
            if (action === "dispatch") {
              t.status = "In Transit";
              t.dispatchDate = today();
              t.dispatchedBy = "Warehouse";
            }
            if (action === "receive") {
              t.status = "Received";
              t.receivedDate = today();
              t.receivedBy = "Warehouse";
              t.lines = t.lines.map((l) => ({ ...l, receivedQty: l.qty, damagedQty: 0 }));
            }
            if (action === "cancel") t.status = "Cancelled";
          },
          {
            action,
            module: "Inventory",
            recordType: "Stock Transfer",
            recordNo: id,
            description: `Transfer ${action}`,
          },
        );
      }
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
        title="Stock Transfers"
        subtitle="Finished goods movements across the branch network"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!can("stock_transfers")}
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
            rows={db.stockTransfers.filter(
              (r) => branch === "ALL" || r.fromId === branch || r.toId === branch,
            )}
            rowKey={(r) => r.id}
            exportName="stock-transfers"
            collection="stockTransfers"
            pageSize={12}
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
              {
                key: "product",
                header: "Product",
                value: (r) => db.products.find((p) => p.id === r.lines[0]?.itemId)?.name ?? "",
              },
              {
                key: "qty",
                header: "Qty",
                align: "right",
                render: (r) => fq(r.lines.reduce((s, l) => s + l.qty, 0)),
                value: (r) => r.lines.reduce((s, l) => s + l.qty, 0),
              },
              {
                key: "status",
                header: "Status",
                render: (r) => <StatusBadge status={r.status} />,
                value: (r) => r.status,
              },
              {
                key: "action",
                header: "Action",
                sortable: false,
                render: (r) => (
                  <div className="flex flex-wrap gap-1">
                    {r.status === "Draft" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[12px]"
                        disabled={!canManage("stock_transfers") || pendingId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void act(r.id, "submit");
                        }}
                      >
                        Submit
                      </Button>
                    ) : null}
                    {r.status === "Submitted" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[12px]"
                        disabled={!canManage("stock_transfers") || pendingId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void act(r.id, "approve");
                        }}
                      >
                        Approve
                      </Button>
                    ) : null}
                    {r.status === "Approved" ? (
                      <Button
                        size="sm"
                        className="h-7 text-[12px]"
                        disabled={!canManage("stock_transfers") || pendingId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void act(r.id, "dispatch");
                        }}
                      >
                        Dispatch
                      </Button>
                    ) : null}
                    {["In Transit", "Partially Received"].includes(r.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[12px]"
                        disabled={!canManage("stock_transfers") || pendingId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void act(r.id, "receive");
                        }}
                      >
                        {pendingId === r.id ? "Receiving..." : "Receive"}
                      </Button>
                    ) : null}
                    {!["Cancelled", "Received"].includes(r.status) ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-[12px]"
                        disabled={!canManage("stock_transfers") || pendingId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void act(r.id, "cancel");
                        }}
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
      <StockTransferDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
