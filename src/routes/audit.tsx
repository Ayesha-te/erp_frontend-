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

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Trail | Zekra Sweets ERP" },
      {
        name: "description",
        content: "Full audit log of created, posted, cancelled and reversed records.",
      },
      { property: "og:title", content: "Audit Trail | Zekra Sweets ERP" },
      {
        property: "og:description",
        content: "Full audit log of created, posted, cancelled and reversed records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Audit,
});

function Audit() {
  const { db } = useErp();
  return (
    <>
      <PageHeader
        title="Audit Trail"
        subtitle="Every posting action recorded with user and timestamp"
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <DataTable
            rows={db.audit}
            rowKey={(r) => r.id}
            exportName="audit-trail"
            pageSize={16}
            emptyTitle="No audit entries yet"
            emptyHint="Post a document and the action is recorded here automatically."
            columns={[
              {
                key: "ts",
                header: "Date/Time",
                render: (r) => fmtDateTime(r.ts),
                value: (r) => r.ts,
              },
              { key: "user", header: "User" },
              {
                key: "action",
                header: "Action",
                render: (r) => (
                  <StatusBadge
                    status={r.action === "Cancelled" ? "Cancelled" : "Posted"}
                    className="mr-1"
                  />
                ),
                value: (r) => r.action,
              },
              { key: "module", header: "Module" },
              { key: "recordType", header: "Record Type" },
              { key: "newStatus", header: "New Status", value: (r) => r.newStatus ?? "" },
              { key: "description", header: "Description" },
            ]}
          />
        </Panel>
      </PageBody>
    </>
  );
}
