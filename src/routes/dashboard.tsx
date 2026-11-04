import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Filter,
  PackageCheck,
  ShoppingCart,
  Factory,
  AlertTriangle,
  ReceiptText,
  WalletCards,
  CircleCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageBody, Panel } from "@/components/erp/Page";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { ReorderAlerts } from "@/components/erp/ReorderAlerts";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErp } from "@/lib/erp/store";
import {
  customerBalance,
  purchaseTotal,
  salesTotal,
  supplierBalance,
  totalReceivables,
} from "@/lib/erp/calc";
import { stockRows } from "@/lib/erp/ledger";
import { aed, fmtDate, qty } from "@/lib/erp/format";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";
import { clearBackendBusinessData } from "@/lib/erp/backend";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | BakeHub" },
      {
        name: "description",
        content: "Bakery operations, sales, production and inventory overview.",
      },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#7c3aed", "#94a3b8"];
const valid = (status: string) => !["Draft", "Cancelled"].includes(status);

function Dashboard() {
  const { db, ledger, branch, user, refreshFromBackend, reset } = useErp();
  const [range, setRange] = useState("30");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [authoritative, setAuthoritative] = useState<{
    total_purchases: number;
    production_today: number;
    finished_goods_quantity: number;
    low_stock_raw_materials: number;
    daily_sales: number;
    receivables: number;
  } | null>(null);
  useEffect(() => {
    if (!getApiTokens().access) return;
    const query = branch === "ALL" ? "" : `?location=${encodeURIComponent(branch)}`;
    apiJson<typeof authoritative>(`${API_ENDPOINTS.dashboard}${query}`)
      .then(setAuthoritative)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load dashboard totals"),
      );
  }, [branch]);

  const model = useMemo(() => {
    const allDates = [
      ...db.salesInvoices.map((x) => x.date),
      ...db.purchaseInvoices.map((x) => x.date),
      ...db.productionBatches.map((x) => x.date),
    ].sort();
    const end = allDates.at(-1) ?? new Date().toISOString().slice(0, 10);
    const fromDate = new Date(end + "T00:00:00");
    fromDate.setDate(fromDate.getDate() - (range === "all" ? 36500 : Number(range) - 1));
    const start = fromDate.toISOString().slice(0, 10);
    const branchLocations = branch === "ALL" ? null : new Set([branch]);
    const sales = db.salesInvoices.filter(
      (x) => valid(x.status) && (!branchLocations || branchLocations.has(x.locationId)),
    );
    const periodSales = sales.filter((x) => x.date >= start && x.date <= end);
    const purchases = db.purchaseInvoices.filter(
      (x) =>
        valid(x.status) &&
        x.date >= start &&
        x.date <= end &&
        (!branchLocations || branchLocations.has(x.warehouseId)),
    );
    const batches = db.productionBatches.filter(
      (x) =>
        x.status === "Completed" &&
        x.date >= start &&
        x.date <= end &&
        (!branchLocations ||
          branchLocations.has(x.productionLocationId) ||
          branchLocations.has(x.fgLocationId)),
    );
    const stocks = stockRows(ledger).filter(
      (x) => !branchLocations || branchLocations.has(x.locationId),
    );
    const stockByLocation = db.locations
      .filter(
        (location) =>
          location.active &&
          location.type !== "virtual" &&
          (!branchLocations || branchLocations.has(location.id)),
      )
      .map((location) => {
        const locationStock = stocks.filter(
          (stock) => stock.locationId === location.id && stock.qty > 0,
        );
        return {
          name: location.name,
          rawMaterials: locationStock
            .filter((stock) => stock.itemType === "RM")
            .reduce((sum, stock) => sum + stock.qty, 0),
          finishedGoods: locationStock
            .filter((stock) => stock.itemType === "FG")
            .reduce((sum, stock) => sum + stock.qty, 0),
          value: locationStock.reduce((sum, stock) => sum + stock.value, 0),
        };
      });
    const fgStock = stocks
      .filter((x) => x.itemType === "FG" && x.qty > 0)
      .reduce((s, x) => s + x.qty, 0);
    const rmTotals = Object.fromEntries(
      db.rawMaterials.map((rm) => [
        rm.id,
        stocks.filter((x) => x.itemId === rm.id).reduce((s, x) => s + x.qty, 0),
      ]),
    );
    const low = db.rawMaterials.filter((rm) => (rmTotals[rm.id] ?? 0) <= rm.reorderLevel);
    const daySales = sales.filter((x) => x.date === end).reduce((s, x) => s + salesTotal(x), 0);
    const dayProduction = batches
      .filter((x) => x.date === end)
      .reduce((s, x) => s + x.producedQty, 0);

    const days: { date: string; sales: number; production: number }[] = [];
    const chartStart = new Date(end + "T00:00:00");
    chartStart.setDate(chartStart.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      const d = new Date(chartStart);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        sales: sales.filter((x) => x.date === iso).reduce((s, x) => s + salesTotal(x), 0),
        production: batches.filter((x) => x.date === iso).reduce((s, x) => s + x.producedQty, 0),
      });
    }
    const branchSales = db.locations
      .filter((l) => ["branch", "shop"].includes(l.type))
      .map((l, i) => ({
        name: l.name,
        value: sales
          .filter((x) => x.locationId === l.id && x.date >= start)
          .reduce((s, x) => s + salesTotal(x), 0),
        color: COLORS[i % COLORS.length],
      }))
      .filter((x) => x.value > 0);
    const expiry = stocks
      .filter((x) => x.itemType === "FG" && x.qty > 0)
      .map((x) => {
        const product = db.products.find((p) => p.id === x.itemId);
        return {
          ...x,
          product: product?.name ?? x.itemId,
          location:
            db.locations.find((location) => location.id === x.locationId)?.name ?? x.locationId,
          reorderLevel: product?.minStock ?? 0,
        };
      })
      .filter((x) => x.qty <= x.reorderLevel)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 5);
    const activityDates = [...periodSales.map((x) => x.date), ...batches.map((x) => x.date)].sort();
    const lastActivity = activityDates.at(-1);
    return {
      end,
      start,
      periodSales,
      purchases,
      batches,
      fgStock,
      low,
      rmTotals,
      daySales,
      dayProduction,
      days,
      branchSales,
      expiry,
      lastActivity,
      stockByLocation,
    };
  }, [db, ledger, branch, range]);

  const customers = db.customers
    .map((x) => ({ name: x.name, ...customerBalance(db, x.id) }))
    .filter((x) => x.outstanding > 0.01)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 5);
  const suppliers = db.suppliers
    .map((x) => ({ name: x.name, ...supplierBalance(db, x.id) }))
    .filter((x) => x.outstanding > 0.01)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 5);
  const recentPurchases = [...model.purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const recentSales = [...model.periodSales]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  async function clearTestingData() {
    setClearing(true);
    try {
      if (getApiTokens().access) {
        const result = await clearBackendBusinessData();
        await refreshFromBackend();
        toast.success(result.message);
      } else {
        reset();
        toast.success("Local testing data cleared");
      }
      setClearOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear testing data");
    } finally {
      setClearing(false);
    }
  }

  const quietAfter =
    model.lastActivity && model.lastActivity < model.end
      ? `No activity after ${fmtDate(model.lastActivity)}`
      : undefined;
  return (
    <main className="min-w-0 max-w-full overflow-x-hidden">
      <header className="flex min-w-0 flex-col gap-3 border-b bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-7 tracking-tight text-foreground sm:text-2xl">
            Dashboard
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Overview of your bakery business
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger
              className="h-8 min-w-0 flex-1 text-xs sm:w-[150px] sm:flex-none"
              aria-label="Dashboard date range"
            >
              <CalendarDays className="mr-1 h-3.5 w-3.5 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 shrink-0">
            <Filter className="h-3.5 w-3.5" /> Filter
          </Button>
          {user?.role === "Administrator" && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => setClearOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear Data
            </Button>
          )}
        </div>
      </header>
      <ReorderAlerts />
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all testing data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove business records from A to Z, including stock, invoices, transfers,
              recipes, products, raw materials, customers, suppliers, locations, reports, and audit
              logs. User login accounts will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearing}
              onClick={(event) => {
                event.preventDefault();
                void clearTestingData();
              }}
            >
              {clearing ? "Clearing..." : "Yes, clear data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageBody className="min-w-0 max-w-full space-y-3 overflow-hidden">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <Kpi
            icon={<ShoppingCart />}
            title="Total Purchases"
            value={
              authoritative
                ? aed(authoritative.total_purchases, 0)
                : aed(
                    model.purchases.reduce((s, x) => s + purchaseTotal(x), 0),
                    0,
                  )
            }
            note={`${model.purchases.length} posted invoices`}
            tone="blue"
          />
          <Kpi
            icon={<Factory />}
            title="Production Today"
            value={`${qty(authoritative?.production_today ?? model.dayProduction)} units`}
            note={`${model.batches.length} batches completed in the selected period`}
            tone="teal"
          />
          <Kpi
            icon={<PackageCheck />}
            title="Finished Goods Stock"
            value={`${qty(authoritative?.finished_goods_quantity ?? model.fgStock)} units`}
            note="Available across selected branch"
            tone="blue"
          />
          <Kpi
            icon={<AlertTriangle />}
            title="Low Stock Materials"
            value={`${authoritative?.low_stock_raw_materials ?? model.low.length} items`}
            note="At or below reorder level"
            tone="amber"
          />
          <Kpi
            icon={<ReceiptText />}
            title="Daily Sales"
            value={aed(authoritative?.daily_sales ?? model.daySales, 0)}
            note={`As of ${fmtDate(model.end)}`}
            tone="green"
          />
          <Kpi
            icon={<WalletCards />}
            title="Outstanding Receivables"
            value={aed(authoritative?.receivables ?? totalReceivables(db), 0)}
            note={`${customers.length} priority accounts`}
            tone="red"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <MiniTable
            title="Stock by Location"
            href="/inventory/stock-ledger"
            headers={["Location", "Raw Materials", "Finished Goods", "Stock Value"]}
            rows={model.stockByLocation.map((x) => [
              x.name,
              qty(x.rawMaterials),
              qty(x.finishedGoods),
              aed(x.value),
            ])}
          />
          <ChartPanel title="Sales Trend" note={quietAfter}>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={model.days} margin={{ left: -15, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(n) => `${n / 1000}k`} />
                <Tooltip formatter={(v: number) => aed(v)} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#salesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="Production Trend" note={quietAfter}>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={model.days} margin={{ left: -15, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [qty(v), "Units"]} />
                <Line
                  type="monotone"
                  dataKey="production"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="Sales by Branch">
            {model.branchSales.length ? (
              <div className="flex min-h-[210px] min-w-0 flex-col items-center justify-center gap-1 sm:flex-row">
                <div className="h-[170px] w-[170px] shrink-0">
                  <PieChart width={170} height={170}>
                    <Pie
                      data={model.branchSales}
                      dataKey="value"
                      nameKey="name"
                      cx={85}
                      cy={85}
                      innerRadius={46}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {model.branchSales.map((x) => (
                        <Cell key={x.name} fill={x.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => aed(v)} />
                  </PieChart>
                </div>
                <div className="w-full min-w-0 flex-1 space-y-2 px-2">
                  {model.branchSales.map((x) => (
                    <div key={x.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: x.color }}
                      />
                      <span className="truncate text-muted-foreground">{x.name}</span>
                      <span className="ml-auto font-medium tabular-nums">
                        {Math.round(
                          (x.value / model.branchSales.reduce((s, y) => s + y.value, 0)) * 100,
                        )}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty />
            )}
          </ChartPanel>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <MiniTable
            title="Recent Purchase Invoices"
            href="/purchasing/invoices"
            headers={["Invoice", "Supplier", "Date", "Amount", "Status"]}
            rows={recentPurchases.map((x) => [
              x.no,
              db.suppliers.find((s) => s.id === x.supplierId)?.name ?? "—",
              fmtDate(x.date),
              aed(purchaseTotal(x), 0),
              <StatusBadge status={x.status} />,
            ])}
          />
          <MiniTable
            title="Low Stock Materials"
            href="/inventory/raw-materials"
            headers={["Material", "Available", "Reorder", "Status"]}
            emptyMessage="All materials are above reorder level."
            healthyEmpty
            rows={model.low
              .slice(0, 5)
              .map((x) => [
                x.name,
                `${qty(model.rmTotals[x.id] ?? 0)} ${x.baseUnit}`,
                `${qty(x.reorderLevel)} ${x.baseUnit}`,
                <StatusBadge status={(model.rmTotals[x.id] ?? 0) <= 0 ? "Out of Stock" : "Low"} />,
              ])}
          />
          <MiniTable
            title="Recent Sales Invoices"
            href="/sales/invoices"
            headers={["Invoice", "Customer", "Date", "Amount", "Status"]}
            rows={recentSales.map((x) => [
              x.no,
              db.customers.find((c) => c.id === x.customerId)?.name ?? "—",
              fmtDate(x.date),
              aed(salesTotal(x), 0),
              <StatusBadge status={x.status} />,
            ])}
          />
          <MiniTable
            title="Low Finished-Goods Stock"
            href="/inventory/finished-goods"
            headers={["Product", "Location", "Reorder Level", "Available", "Status"]}
            rows={model.expiry.map((x) => [
              x.product,
              x.location,
              qty(x.reorderLevel),
              qty(x.qty),
              <StatusBadge status="Low" />,
            ])}
          />
          <MiniTable
            title="Outstanding Customer Balances"
            href="/sales/customers"
            headers={["Customer", "Outstanding", "Status"]}
            rows={customers.map((x) => [
              x.name,
              aed(x.outstanding, 0),
              <StatusBadge status="Due" />,
            ])}
          />
          <MiniTable
            title="Outstanding Supplier Balances"
            href="/purchasing/suppliers"
            headers={["Supplier", "Outstanding", "Status"]}
            rows={suppliers.map((x) => [
              x.name,
              aed(x.outstanding, 0),
              <StatusBadge status="Due" />,
            ])}
          />
        </div>
      </PageBody>
    </main>
  );
}

function Kpi({
  icon,
  title,
  value,
  note,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  note: string;
  tone: string;
}) {
  const tones: Record<string, string> = {
    blue: "bg-primary/10 text-primary",
    teal: "bg-teal/10 text-teal",
    green: "bg-success/10 text-success",
    amber: "bg-warning/15 text-warning-foreground",
    red: "bg-destructive/10 text-destructive",
  };
  return (
    <section className="rounded-md border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        </div>
        <span className={`[&>svg]:h-4 [&>svg]:w-4 rounded-md p-2 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-2 truncate text-[11px] text-muted-foreground">{note}</p>
    </section>
  );
}
function ChartPanel({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <Panel title={title} className="min-w-0" bodyClass="min-w-0 px-2 pb-2 pt-1">
      <div className="min-w-0">{children}</div>
      {note && <p className="px-2 pb-1 text-[11px] text-muted-foreground">{note}</p>}
    </Panel>
  );
}
function Empty() {
  return (
    <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">
      No posted activity in this period.
    </div>
  );
}
function MiniTable({
  title,
  href,
  headers,
  rows,
  emptyMessage = "No records to display.",
  healthyEmpty = false,
}: {
  title: string;
  href: string;
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
  healthyEmpty?: boolean;
}) {
  return (
    <Panel
      title={title}
      className="min-w-0"
      actions={
        <Link
          to={href}
          className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all
        </Link>
      }
      bodyClass="min-w-0 p-0"
    >
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[440px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={`max-w-[150px] truncate px-3 py-2 ${typeof c === "string" && c.startsWith("AED") ? "text-right font-medium tabular-nums" : ""}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {healthyEmpty ? (
                    <span className="inline-flex items-center gap-2 text-success">
                      <CircleCheck className="h-4 w-4" />
                      {emptyMessage}
                    </span>
                  ) : (
                    emptyMessage
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
