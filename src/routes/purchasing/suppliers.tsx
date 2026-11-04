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

export const Route = createFileRoute("/purchasing/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Supplier master data, purchase history, ledgers and outstanding balances.",
      },
      { property: "og:title", content: "Suppliers | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Supplier master data, purchase history, ledgers and outstanding balances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Suppliers,
});

function Suppliers() {
  const { db, can } = useErp();
  const [open, setOpen] = useState(false);
  const rows = db.suppliers.map((s) => ({ ...s, ...supplierBalance(db, s.id) }));
  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Vendor master data and payables"
        actions={
          <Button size="sm" disabled={!can("suppliers")} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Supplier
          </Button>
        }
      />
      <MasterDataDialog kind="supplier" open={open} onOpenChange={setOpen} />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="suppliers"
            collection="suppliers"
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Supplier" },
              { key: "contact", header: "Contact", hideOnMobile: true },
              { key: "phone", header: "Phone", hideOnMobile: true },
              { key: "paymentTerms", header: "Terms", hideOnMobile: true },
              {
                key: "billed",
                header: "Purchases",
                align: "right",
                render: (r) => aed(r.billed),
                value: (r) => r.billed,
              },
              {
                key: "paid",
                header: "Paid",
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
