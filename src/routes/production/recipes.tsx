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

export const Route = createFileRoute("/production/recipes")({
  head: () => ({
    meta: [
      { title: "Recipes & Bill of Materials | BakeHub" },
      {
        name: "description",
        content: "Versioned bakery recipes with material costing and expected wastage.",
      },
      { property: "og:title", content: "Recipes & Bill of Materials | BakeHub" },
      {
        property: "og:description",
        content: "Versioned bakery recipes with material costing and expected wastage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Recipes,
});

function Recipes() {
  const { db, can } = useErp();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const recipe = db.recipes.find((r) => r.id === sel) ?? db.recipes[0];
  const lines = (recipe?.lines ?? []).flatMap((l) => {
    const rm = db.rawMaterials.find((r) => r.id === l.itemId);
    if (!rm) return [];
    const eff = l.qty * (1 + l.wastagePct / 100);
    return {
      ...l,
      name: rm.name,
      unit: rm.baseUnit,
      cost: rm.standardCost,
      total: eff * rm.standardCost,
      eff,
    };
  });
  const totalCost = lines.reduce((s, l) => s + l.total, 0);
  return (
    <>
      <PageHeader
        title="Recipes & Bill of Materials"
        subtitle="One active version per product; historical production runs retain their version"
        actions={
          <Button size="sm" disabled={!can("recipes")} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Recipe / BOM
          </Button>
        }
      />
      <MasterDataDialog kind="recipe" open={open} onOpenChange={setOpen} />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={db.recipes}
            rowKey={(r) => r.id}
            exportName="recipes"
            collection="recipes"
            pageSize={8}
            onRowClick={(r) => setSel(r.id)}
            columns={[
              { key: "no", header: "Recipe No." },
              {
                key: "product",
                header: "Finished Product",
                value: (r) => db.products.find((p) => p.id === r.productId)?.name ?? "",
              },
              { key: "outputQty", header: "Std Output", align: "right", value: (r) => r.outputQty },
              { key: "outputUnit", header: "Unit" },
              { key: "version", header: "Version" },
              {
                key: "effectiveDate",
                header: "Effective",
                render: (r) => fmtDate(r.effectiveDate),
                value: (r) => r.effectiveDate,
                hideOnMobile: true,
              },
              { key: "lines", header: "Materials", align: "right", value: (r) => r.lines.length },
              {
                key: "status",
                header: "Status",
                render: (r) => <StatusBadge status={r.status} />,
                value: (r) => r.status,
              },
            ]}
          />
        </Panel>
        {recipe ? (
          <Panel
            title={`${recipe.no} — ${db.products.find((p) => p.id === recipe.productId)?.name}`}
            description={`Standard output ${recipe.outputQty} ${recipe.outputUnit} • version ${recipe.version}`}
            bodyClass="p-3"
          >
            <div className="erp-table-wrap">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-surface-muted">
                  <tr>
                    {[
                      "Raw Material",
                      "Required Qty",
                      "Unit",
                      "Wastage %",
                      "Effective Qty",
                      "Unit Cost",
                      "Total Cost",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border-b px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.itemId} className="border-b last:border-0">
                      <td className="px-3 py-1.5">{l.name}</td>
                      <td className="num px-3 py-1.5">{fq(l.qty)}</td>
                      <td className="px-3 py-1.5">{l.unit}</td>
                      <td className="num px-3 py-1.5">{l.wastagePct}%</td>
                      <td className="num px-3 py-1.5">{fq(Math.round(l.eff * 100) / 100)}</td>
                      <td className="num px-3 py-1.5">{aed(l.cost, 3)}</td>
                      <td className="num px-3 py-1.5 font-medium">{aed(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-surface-muted p-3">
                <p className="text-[12px] text-muted-foreground">Total material cost</p>
                <p className="num text-[16px] font-semibold">{aed(totalCost)}</p>
              </div>
              <div className="rounded-md border bg-surface-muted p-3">
                <p className="text-[12px] text-muted-foreground">Cost per output unit</p>
                <p className="num text-[16px] font-semibold">{aed(totalCost / recipe.outputQty)}</p>
              </div>
              <div className="rounded-md border bg-surface-muted p-3">
                <p className="text-[12px] text-muted-foreground">Standard selling price</p>
                <p className="num text-[16px] font-semibold">
                  {aed(db.products.find((p) => p.id === recipe.productId)?.price ?? 0)}
                </p>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="No recipes yet" bodyClass="p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                Create a finished product and raw materials first, then add its recipe or bill of
                materials.
              </p>
              <Button size="sm" disabled={!can("recipes")} onClick={() => setOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Recipe / BOM
              </Button>
            </div>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
