import { useEffect, useState } from "react";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";
import { qty as fq } from "@/lib/erp/format";
import { PurchaseInvoiceDialog, type PurchasePrefill } from "./dialogs";

type Alert = {
  id: string;
  severity: "CRITICAL" | "WARNING";
  raw_material: string;
  raw_material_name: string;
  unit: string;
  current_stock: number;
  days_left: number;
  suggested_order_quantity: number;
  last_supplier: string | null;
  last_purchase_rate: number;
};

/** Smart Reorder Alerts: red = critical (<= 3 days), yellow = warning (<= 7 days). */
export function ReorderAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [prefill, setPrefill] = useState<PurchasePrefill | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getApiTokens().access) return;
    apiJson<{ alerts: Alert[] }>(API_ENDPOINTS.reorderAlerts)
      .then((r) => setAlerts(r.alerts))
      .catch(() => setAlerts([]));
  }, []);

  if (!alerts.length && !open) return null;

  const create = (a: Alert) => {
    setPrefill({
      supplierId: a.last_supplier ?? undefined,
      notes: `Smart reorder: ${a.raw_material_name} runs out in ${fq(a.days_left)} days`,
      lines: [
        {
          itemId: a.raw_material,
          qty: Number(a.suggested_order_quantity),
          rate: Number(a.last_purchase_rate),
        },
      ],
    });
    setOpen(true);
  };

  return (
    <section className="px-4 pt-4 sm:px-6" aria-label="Smart reorder alerts">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4" /> Smart Reorder Alerts
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {alerts.map((a) => {
          const critical = a.severity === "CRITICAL";
          return (
            <div
              key={a.id}
              data-testid={`reorder-${critical ? "critical" : "warning"}`}
              className={
                "rounded-lg border p-3 " +
                (critical
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-yellow-300 bg-yellow-50 text-yellow-900")
              }
            >
              <p className="text-[13px] font-semibold">
                {critical ? "Critical" : "Warning"} — {a.raw_material_name} runs out in{" "}
                {fq(a.days_left)} days. Suggested order: {fq(a.suggested_order_quantity)}{" "}
                {a.unit.toLowerCase()}
              </p>
              <p className="mt-1 text-[12px] opacity-80">
                In stock: {fq(a.current_stock)} {a.unit.toLowerCase()}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-8 gap-1.5 bg-white/70"
                onClick={() => create(a)}
              >
                <ShoppingCart className="h-3.5 w-3.5" /> Create Purchase Order
              </Button>
            </div>
          );
        })}
      </div>
      <PurchaseInvoiceDialog open={open} onOpenChange={setOpen} prefill={prefill} />
    </section>
  );
}
