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

export const Route = createFileRoute("/inventory/raw-materials")({
  head: () => ({
    meta: [
      { title: "Raw Materials | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Raw material master, stock by location, average cost and reorder alerts.",
      },
      { property: "og:title", content: "Raw Materials | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Raw material master, stock by location, average cost and reorder alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RawMaterials,
});

function RawMaterials() {
  const { db, ledger, can, branch } = useErp();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const s = stockRows(ledger).filter((row) => branch === "ALL" || row.locationId === branch);
    return db.rawMaterials.map((rm) => {
      const total = s.filter((r) => r.itemId === rm.id).reduce((a, b) => a + b.qty, 0);
      const value = s.filter((r) => r.itemId === rm.id).reduce((a, b) => a + b.value, 0);
      const wh = s
        .filter(
          (row) =>
            row.itemId === rm.id &&
            db.locations.find((l) => l.id === row.locationId)?.type === "raw_warehouse",
        )
        .reduce((sum, row) => sum + row.qty, 0);
      const prod = s
        .filter(
          (row) =>
            row.itemId === rm.id &&
            db.locations.find((l) => l.id === row.locationId)?.type === "production",
        )
        .reduce((sum, row) => sum + row.qty, 0);
      return {
        ...rm,
        total,
        value,
        wh,
        prod,
        avg: total > 0 ? value / total : rm.standardCost,
        state: total <= 0 ? "Out of Stock" : total <= rm.reorderLevel ? "Low" : "Good",
      };
    });
  }, [db, ledger, branch]);
  return (
    <>
      <PageHeader
        title="Raw Materials"
        subtitle="Material master with live stock derived from the stock ledger"
        actions={
          <Button size="sm" disabled={!can("raw_materials")} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Raw Material
          </Button>
        }
      />
      <MasterDataDialog kind="rawMaterial" open={open} onOpenChange={setOpen} />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="raw-materials"
            collection="rawMaterials"
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Material" },
              {
                key: "cat",
                header: "Category",
                value: (r) => db.categories.find((c) => c.id === r.categoryId)?.name ?? "",
                hideOnMobile: true,
              },
              { key: "baseUnit", header: "Unit" },
              {
                key: "wh",
                header: "Warehouse",
                align: "right",
                render: (r) => fq(r.wh),
                value: (r) => r.wh,
              },
              {
                key: "prod",
                header: "Production",
                align: "right",
                render: (r) => fq(r.prod),
                value: (r) => r.prod,
              },
              {
                key: "total",
                header: "Total Stock",
                align: "right",
                render: (r) => fq(r.total),
                value: (r) => r.total,
              },
              {
                key: "reorderLevel",
                header: "Reorder",
                align: "right",
                hideOnMobile: true,
              },
              {
                key: "avg",
                header: "Avg Cost",
                align: "right",
                render: (r) => aed(r.avg, 3),
                value: (r) => r.avg,
              },
              {
                key: "value",
                header: "Stock Value",
                align: "right",
                render: (r) => aed(r.value),
                value: (r) => r.value,
              },
              {
                key: "state",
                header: "Status",
                render: (r) => <StatusBadge status={r.state} />,
                value: (r) => r.state,
              },
            ]}
          />
        </Panel>
      </PageBody>
    </>
  );
}
