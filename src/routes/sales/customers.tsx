import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasterDataDialog } from "@/components/erp/MasterDataDialog";
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

export const Route = createFileRoute("/sales/customers")({
  head: () => ({
    meta: [
      { title: "Customers | BakeHub" },
      {
        name: "description",
        content: "Customer master data, credit limits, receivables and sales history.",
      },
      { property: "og:title", content: "Customers | BakeHub" },
      {
        property: "og:description",
        content: "Customer master data, credit limits, receivables and sales history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Customers,
});

function Customers() {
  const { db, can, branch } = useErp();
  const [open, setOpen] = useState(false);
  const rows = db.customers
    .filter((c) => branch === "ALL" || c.branchId === branch)
    .map((c) => ({
      ...c,
      ...customerBalance(db, c.id),
      branch: db.locations.find((l) => l.id === c.branchId)?.name ?? "",
    }));
  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Accounts receivable and customer master data"
        actions={
          <Button size="sm" disabled={!can("customers")} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Customer
          </Button>
        }
      />
      <MasterDataDialog kind="customer" open={open} onOpenChange={setOpen} />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="customers"
            collection="customers"
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Customer" },
              { key: "type", header: "Type", hideOnMobile: true },
              { key: "branch", header: "Branch", hideOnMobile: true },
              { key: "paymentTerms", header: "Terms", hideOnMobile: true },
              {
                key: "creditLimit",
                header: "Credit Limit",
                align: "right",
                render: (r) => aed(r.creditLimit, 0),
                value: (r) => r.creditLimit,
              },
              {
                key: "billed",
                header: "Sales",
                align: "right",
                render: (r) => aed(r.billed),
                value: (r) => r.billed,
              },
              {
                key: "paid",
                header: "Received",
                align: "right",
                render: (r) => aed(r.paid),
                value: (r) => r.paid,
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
                render: (r) => <StatusBadge status={r.active ? "Active" : "Inactive"} />,
                value: (r) => (r.active ? "Active" : "Inactive"),
              },
            ]}
          />
        </Panel>
      </PageBody>
    </>
  );
}
