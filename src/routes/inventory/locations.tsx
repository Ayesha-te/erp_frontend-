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

export const Route = createFileRoute("/inventory/locations")({
  head: () => ({
    meta: [
      { title: "Locations | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Warehouses, production floor, branches, retail shops and delivery vans.",
      },
      { property: "og:title", content: "Locations | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Warehouses, production floor, branches, retail shops and delivery vans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Locations,
});

function Locations() {
  const { db, ledger, can } = useErp();
  const [open, setOpen] = useState(false);
  const rows = db.locations.map((l) => {
    const s = stockRows(ledger).filter((r) => r.locationId === l.id);
    return {
      ...l,
      items: s.filter((r) => Math.abs(r.qty) > 0.001).length,
      value: s.reduce((a, b) => a + b.value, 0),
    };
  });
  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Every stock-holding location in the network"
        actions={
          <Button size="sm" disabled={!can("inventory")} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Location / Branch
          </Button>
        }
      />
      <MasterDataDialog kind="location" open={open} onOpenChange={setOpen} />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="locations"
            collection="locations"
            pageSize={15}
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Location" },
              { key: "type", header: "Type", value: (r) => r.type.replace(/_/g, " ") },
              { key: "items", header: "Stocked Items", align: "right" },
              {
                key: "value",
                header: "Stock Value",
                align: "right",
                render: (r) => aed(r.value),
                value: (r) => r.value,
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
