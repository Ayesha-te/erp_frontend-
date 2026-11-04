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

export const Route = createFileRoute("/sales/returns")({
  head: () => ({
    meta: [
      { title: "Sales Returns | Zekra Sweets ERP" },
      {
        name: "description",
        content:
          "Book customer returns against original invoices with condition-based stock handling.",
      },
      { property: "og:title", content: "Sales Returns | Zekra Sweets ERP" },
      {
        property: "og:description",
        content:
          "Book customer returns against original invoices with condition-based stock handling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesReturns,
});

import { SalesReturnDialog } from "@/components/erp/dialogs";
import { API_ENDPOINTS, apiJson } from "@/lib/api";
import { toast } from "sonner";

function SalesReturns() {
  const { db, can, branch, refreshFromBackend } = useErp();
  const [open, setOpen] = useQuickCreate();
  const [pendingId, setPendingId] = useState("");
  const act = async (id: string, action: "submit" | "post" | "cancel") => {
    if (pendingId) return;
    setPendingId(id);
    try {
      await apiJson(`${API_ENDPOINTS.salesReturns}${id}/${action}/`, {
        method: "POST",
        idempotent: action === "post" || action === "cancel",
        body:
          action === "cancel"
            ? JSON.stringify({ reason: window.prompt("Cancellation reason") || "" })
            : undefined,
      });
      await refreshFromBackend();
      toast.success(`Return ${action} successful`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} return`);
    } finally {
      setPendingId("");
    }
  };
  return (
    <>
      <PageHeader
        title="Sales Returns"
        subtitle="Returns linked to original invoices; saleable stock goes back to inventory"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!can("sales_returns")}
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Return
          </Button>
        }
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={db.salesReturns.filter((r) => branch === "ALL" || r.locationId === branch)}
            rowKey={(r) => r.id}
            exportName="sales-returns"
            collection="salesReturns"
            columns={[
              { key: "no", header: "Return No." },
              {
                key: "invoice",
                header: "Original Invoice",
                value: (r) => db.salesInvoices.find((i) => i.id === r.invoiceId)?.no ?? "",
              },
              {
                key: "customer",
                header: "Customer",
                value: (r) => db.customers.find((c) => c.id === r.customerId)?.name ?? "",
              },
              { key: "date", header: "Date", render: (r) => fmtDate(r.date), value: (r) => r.date },
              {
                key: "loc",
                header: "Location",
                value: (r) => db.locations.find((l) => l.id === r.locationId)?.name ?? "",
                hideOnMobile: true,
              },
              {
                key: "qty",
                header: "Qty",
                align: "right",
                render: (r) => fq(r.lines.reduce((s, l) => s + l.qty, 0)),
                value: (r) => r.lines.reduce((s, l) => s + l.qty, 0),
              },
              {
                key: "condition",
                header: "Condition",
                value: (r) => r.lines.map((l) => l.condition).join(", "),
              },
              {
                key: "amount",
                header: "Credit",
                align: "right",
                render: (r) => aed(r.lines.reduce((s, l) => s + l.amount, 0)),
                value: (r) => r.lines.reduce((s, l) => s + l.amount, 0),
              },
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
                    {["Draft", "Submitted", "Approved"].includes(r.status) ? (
                      <Button size="sm" disabled={!!pendingId} onClick={() => act(r.id, "post")}>
                        Post
                      </Button>
                    ) : null}
                    {r.status === "Posted" ? (
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
      <SalesReturnDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
