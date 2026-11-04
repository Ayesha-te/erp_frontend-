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

export const Route = createFileRoute("/purchasing/invoices")({
  head: () => ({
    meta: [
      { title: "Purchase Invoices | BakeHub" },
      {
        name: "description",
        content: "Record, post and track supplier purchase invoices and raw material receipts.",
      },
      { property: "og:title", content: "Purchase Invoices | BakeHub" },
      {
        property: "og:description",
        content: "Record, post and track supplier purchase invoices and raw material receipts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurchaseInvoices,
});

import { PurchaseInvoiceDialog } from "@/components/erp/dialogs";

function PurchaseInvoices() {
  const { db, can, branch } = useErp();
  const [open, setOpen] = useQuickCreate();
  const rows = db.purchaseInvoices
    .filter((p) => branch === "ALL" || p.warehouseId === branch)
    .map((p) => {
      const total = purchaseTotal(p);
      const paid = paidFor(db, "purchase", p.id);
      return {
        ...p,
        total,
        paid,
        outstanding: total - paid,
        display: invoiceStatus(p.status, total, paid, p.dueDate),
      };
    });
  return (
    <>
      <PageHeader
        title="Purchase Invoices"
        subtitle="Supplier bills, raw material receipts and payables"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!can("purchasing")}
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Invoice
          </Button>
        }
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="purchase-invoices"
            collection="purchaseInvoices"
            mobileCard={(r) => (
              <div className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{r.no}</span>
                  <StatusBadge status={r.display} />
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {db.suppliers.find((s) => s.id === r.supplierId)?.name} • {fmtDate(r.date)}
                </div>
                <div className="num text-[13px] font-medium">{aed(r.total)}</div>
              </div>
            )}
            columns={[
              { key: "no", header: "Invoice No." },
              {
                key: "supplier",
                header: "Supplier",
                value: (r) => db.suppliers.find((s) => s.id === r.supplierId)?.name ?? "",
              },
              { key: "date", header: "Date", render: (r) => fmtDate(r.date), value: (r) => r.date },
              {
                key: "dueDate",
                header: "Due",
                render: (r) => fmtDate(r.dueDate),
                value: (r) => r.dueDate,
                hideOnMobile: true,
              },
              {
                key: "wh",
                header: "Warehouse",
                value: (r) => db.locations.find((l) => l.id === r.warehouseId)?.name ?? "",
                hideOnMobile: true,
              },
              {
                key: "total",
                header: "Total",
                align: "right",
                render: (r) => aed(r.total),
                value: (r) => r.total,
              },
              {
                key: "paid",
                header: "Paid",
                align: "right",
                render: (r) => aed(r.paid),
                value: (r) => r.paid,
                hideOnMobile: true,
              },
              {
                key: "outstanding",
                header: "Outstanding",
                align: "right",
                render: (r) => aed(r.outstanding),
                value: (r) => r.outstanding,
              },
              {
                key: "status",
                header: "Status",
                render: (r) => <StatusBadge status={r.display} />,
                value: (r) => r.display,
              },
            ]}
          />
        </Panel>
      </PageBody>
      <PurchaseInvoiceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
