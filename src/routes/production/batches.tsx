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

export const Route = createFileRoute("/production/batches")({
  head: () => ({
    meta: [
      { title: "Production Runs | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Plan and complete production runs with automatic recipe scaling and costing.",
      },
      { property: "og:title", content: "Production Runs | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Plan and complete production runs with automatic recipe scaling and costing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Batches,
});

import { ProductionBatchDialog } from "@/components/erp/dialogs";
import { productionCost } from "@/lib/erp/ledger";

function Batches() {
  const { db, can, branch } = useErp();
  const [open, setOpen] = useQuickCreate();
  const rows = db.productionBatches
    .filter(
      (b) => branch === "ALL" || b.productionLocationId === branch || b.fgLocationId === branch,
    )
    .map((b) => ({ ...b, cost: productionCost(db, b.id) }));
  return (
    <>
      <PageHeader
        title="Production Runs"
        subtitle="Each run is audited while finished output joins combined product stock"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!can("production")}
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Production Run
          </Button>
        }
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="production-batches"
            collection="productionBatches"
            pageSize={12}
            columns={[
              { key: "no", header: "Production No." },
              {
                key: "product",
                header: "Product",
                value: (r) => db.products.find((p) => p.id === r.productId)?.name ?? "",
              },
              { key: "recipeVersion", header: "Recipe", hideOnMobile: true },
              {
                key: "date",
                header: "Completed",
                render: (r) => fmtDate(r.date),
                value: (r) => r.date,
              },
              {
                key: "producedQty",
                header: "Produced",
                align: "right",
                render: (r) => fq(r.producedQty),
                value: (r) => r.producedQty,
              },
              {
                key: "total",
                header: "Production Cost",
                align: "right",
                render: (r) => aed(r.cost.total),
                value: (r) => r.cost.total,
              },
              {
                key: "perUnit",
                header: "Cost / Unit",
                align: "right",
                render: (r) => aed(r.cost.perUnit),
                value: (r) => r.cost.perUnit,
              },
              {
                key: "status",
                header: "Status",
                render: (r) => <StatusBadge status={r.status} />,
                value: (r) => r.status,
              },
            ]}
          />
        </Panel>
      </PageBody>
      <ProductionBatchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
