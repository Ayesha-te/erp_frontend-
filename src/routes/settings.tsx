import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCreateDialog, type SettingKind } from "@/components/erp/SettingsCreateDialog";
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

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Company settings, units, tax rates, payment methods and database controls.",
      },
      { property: "og:title", content: "Settings | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Company settings, units, tax rates, payment methods and database controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

import { toast } from "sonner";

function Settings() {
  const { db, reset, can } = useErp();
  const [create, setCreate] = useState<SettingKind | null>(null);
  const add = (kind: SettingKind, label: string) => (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 text-xs"
      disabled={!can("settings")}
      onClick={() => setCreate(kind)}
    >
      <Plus className="h-3.5 w-3.5" />
      Add {label}
    </Button>
  );
  return (
    <>
      <PageHeader title="Settings" subtitle="Master configuration for the Zekra Sweets ERP" />
      {create && (
        <SettingsCreateDialog kind={create} open onOpenChange={(v) => !v && setCreate(null)} />
      )}
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Units of measurement" actions={add("uom", "Unit")} bodyClass="p-3">
            <DataTable
              rows={db.uoms}
              rowKey={(r) => r.id}
              pageSize={6}
              exportName="uoms"
              collection="uoms"
              columns={[
                { key: "code", header: "Code" },
                { key: "name", header: "Name" },
              ]}
            />
          </Panel>
          <Panel title="Tax rates" actions={add("tax", "Tax Rate")} bodyClass="p-3">
            <DataTable
              rows={db.taxRates}
              rowKey={(r) => r.id}
              pageSize={6}
              exportName="tax-rates"
              collection="taxRates"
              columns={[
                { key: "name", header: "Name" },
                { key: "rate", header: "Rate %", align: "right" },
              ]}
            />
          </Panel>
          <Panel title="Payment methods" actions={add("payment", "Method")} bodyClass="p-3">
            <DataTable
              rows={db.paymentMethods}
              rowKey={(r) => r.id}
              pageSize={6}
              exportName="payment-methods"
              collection="paymentMethods"
              columns={[{ key: "name", header: "Method" }]}
            />
          </Panel>
        </div>
        <Panel title="Employees" actions={add("employee", "Employee")} bodyClass="p-3">
          <DataTable
            rows={db.employees}
            rowKey={(r) => r.id}
            exportName="employees"
            collection="employees"
            columns={[
              { key: "code", header: "Code" },
              { key: "name", header: "Name" },
              { key: "department", header: "Department" },
              { key: "role", header: "Role" },
              {
                key: "status",
                header: "Status",
                render: (r) => <StatusBadge status={r.active ? "Active" : "Inactive"} />,
                value: (r) => (r.active ? "Active" : "Inactive"),
              },
            ]}
          />
        </Panel>
        <Panel title="Categories" actions={add("category", "Category")} bodyClass="p-3">
          <DataTable
            rows={db.categories.filter((category) => category.active !== false)}
            rowKey={(r) => r.id}
            exportName="categories"
            collection="categories"
            columns={[
              { key: "id", header: "Category ID" },
              { key: "name", header: "Name" },
              {
                key: "kind",
                header: "Type",
                value: (r) => (r.kind === "RM" ? "Raw Material" : "Finished Goods"),
              },
            ]}
          />
        </Panel>
        <Panel
          title="Database tools"
          description="Clears the local browser cache and signs out of this device."
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              toast.success("Local cache cleared");
            }}
          >
            Clear local cache
          </Button>
        </Panel>
      </PageBody>
    </>
  );
}
