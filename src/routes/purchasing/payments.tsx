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

export const Route = createFileRoute("/purchasing/payments")({
  head: () => ({
    meta: [
      { title: "Supplier Payments | BakeHub" },
      {
        name: "description",
        content: "Record supplier payments and allocate them across purchase invoices.",
      },
      { property: "og:title", content: "Supplier Payments | BakeHub" },
      {
        property: "og:description",
        content: "Record supplier payments and allocate them across purchase invoices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupplierPayments,
});

import { PaymentDialog } from "@/components/erp/dialogs";
import { API_ENDPOINTS, apiJson } from "@/lib/api";
import { toast } from "sonner";

function SupplierPayments() {
  const { db, can, refreshFromBackend } = useErp();
  const [open, setOpen] = useQuickCreate();
  const [pendingId, setPendingId] = useState("");
  const act = async (id: string, action: "post" | "cancel") => {
    if (pendingId) return;
    setPendingId(id);
    try {
      await apiJson(`${API_ENDPOINTS.supplierPayments}${id}/${action}/`, {
        method: "POST",
        idempotent: true,
        body:
          action === "cancel"
            ? JSON.stringify({ reason: window.prompt("Cancellation reason") || "" })
            : undefined,
      });
      await refreshFromBackend();
      toast.success(`Payment ${action} successful`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} payment`);
    } finally {
      setPendingId("");
    }
  };
  return (
    <>
      <PageHeader
        title="Supplier Payments"
        subtitle="Outgoing payments and invoice allocation"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!can("supplier_payments")}
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Payment
          </Button>
        }
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={db.supplierPayments}
            rowKey={(r) => r.id}
            exportName="supplier-payments"
            collection="supplierPayments"
            columns={[
              { key: "no", header: "Payment No." },
              {
                key: "party",
                header: "Supplier",
                value: (r) => db.suppliers.find((s) => s.id === r.partyId)?.name ?? "",
              },
              { key: "date", header: "Date", render: (r) => fmtDate(r.date), value: (r) => r.date },
              { key: "method", header: "Method", hideOnMobile: true },
              { key: "reference", header: "Reference", hideOnMobile: true },
              {
                key: "alloc",
                header: "Allocated To",
                value: (r) =>
                  r.allocations
                    .map((a) => db.purchaseInvoices.find((i) => i.id === a.invoiceId)?.no)
                    .join(", "),
                hideOnMobile: true,
              },
              {
                key: "amount",
                header: "Amount",
                align: "right",
                render: (r) => aed(r.amount),
                value: (r) => r.amount,
              },
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
      <PaymentDialog open={open} onOpenChange={setOpen} kind="supplier" />
    </>
  );
}
