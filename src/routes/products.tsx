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

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Finished Products | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Finished product master with pricing, standard cost, margin and live stock.",
      },
      { property: "og:title", content: "Finished Products | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Finished product master with pricing, standard cost, margin and live stock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Products,
});

function Products() {
  const { db, ledger, can } = useErp();
  const [open, setOpen] = useState(false);
  const rows = db.products.map((p) => {
    const s = stockRows(ledger).filter((r) => r.itemId === p.id);
    const stock = s.reduce((a, b) => a + b.qty, 0);
    return {
      ...p,
      stock,
      margin: p.price ? ((p.price - p.standardCost) / p.price) * 100 : 0,
      recipe: db.recipes.find((r) => r.productId === p.id && r.status === "Active")?.no ?? "—",
      state: stock <= 0 ? "Out of Stock" : stock <= p.minStock ? "Low" : "Good",
    };
  });
  return (
    <>
      <PageHeader
        title="Finished Products"
        subtitle="Product master, pricing and margins"
        actions={
          <Button size="sm" disabled={!can("finished_goods")} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Finished Product
          </Button>
        }
      />
      <MasterDataDialog kind="product" open={open} onOpenChange={setOpen} />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="products"
            collection="products"
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Product" },
              {
                key: "cat",
                header: "Category",
                value: (r) => db.categories.find((c) => c.id === r.categoryId)?.name ?? "",
                hideOnMobile: true,
              },
              { key: "salesUnit", header: "Unit" },
              { key: "recipe", header: "Active Recipe", hideOnMobile: true },
              {
                key: "standardCost",
                header: "Std Cost",
                align: "right",
                render: (r) => aed(r.standardCost),
                value: (r) => r.standardCost,
              },
              {
                key: "price",
                header: "Price",
                align: "right",
                render: (r) => aed(r.price),
                value: (r) => r.price,
              },
              {
                key: "margin",
                header: "Margin",
                align: "right",
                render: (r) => r.margin.toFixed(1) + "%",
                value: (r) => r.margin,
              },
              {
                key: "stock",
                header: "Stock",
                align: "right",
                render: (r) => fq(r.stock),
                value: (r) => r.stock,
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
