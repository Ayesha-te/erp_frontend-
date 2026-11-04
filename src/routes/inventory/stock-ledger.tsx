import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/inventory/stock-ledger")({
  head: () => ({
    meta: [
      { title: "Stock Ledger | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Every inventory movement with source document, location and running balance.",
      },
      { property: "og:title", content: "Stock Ledger | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Every inventory movement with source document, location and running balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockLedger,
});

function StockLedger() {
  const { db, ledger, branch } = useErp();
  const rows = useMemo(() => {
    const bal: Record<string, number> = {};
    return ledger
      .map((l) => {
        const k = l.itemId + "|" + l.locationId;
        bal[k] = (bal[k] ?? 0) + l.qtyIn - l.qtyOut;
        const it =
          db.rawMaterials.find((r) => r.id === l.itemId) ??
          db.products.find((p) => p.id === l.itemId);
        return {
          ...l,
          itemName: it?.name ?? l.itemId,
          locName: db.locations.find((x) => x.id === l.locationId)?.name ?? "",
          balance: Math.round(bal[k] * 1000) / 1000,
        };
      })
      .filter((row) => branch === "ALL" || row.locationId === branch)
      .reverse();
  }, [ledger, db, branch]);
  return (
    <>
      <PageHeader
        title="Stock Ledger"
        subtitle={`${ledger.length} traceable inventory transactions`}
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            exportName="stock-ledger"
            pageSize={18}
            columns={[
              {
                key: "ts",
                header: "Date/Time",
                render: (r) => fmtDateTime(r.ts),
                value: (r) => r.ts,
              },
              { key: "txnNo", header: "Txn No." },
              { key: "type", header: "Type" },
              { key: "itemName", header: "Item" },
              { key: "itemType", header: "Item Type", hideOnMobile: true },
              { key: "locName", header: "Location" },
              {
                key: "qtyIn",
                header: "Qty In",
                align: "right",
                render: (r) => (r.qtyIn ? fq(r.qtyIn) : "—"),
              },
              {
                key: "qtyOut",
                header: "Qty Out",
                align: "right",
                render: (r) => (r.qtyOut ? fq(r.qtyOut) : "—"),
              },
              {
                key: "balance",
                header: "Balance",
                align: "right",
                render: (r) => fq(r.balance),
                value: (r) => r.balance,
              },
              {
                key: "value",
                header: "Value",
                align: "right",
                render: (r) => aed(r.value),
                value: (r) => r.value,
                hideOnMobile: true,
              },
              { key: "user", header: "User", hideOnMobile: true },
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
    </>
  );
}
