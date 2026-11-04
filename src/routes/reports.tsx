import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Filter, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageBody, Panel } from "@/components/erp/Page";
import { useErp } from "@/lib/erp/store";
import { lineAmounts } from "@/lib/erp/calc";
import { aed, qty } from "@/lib/erp/format";
import { API_ENDPOINTS, apiFetch, apiJson, getApiTokens } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({ component: Reports });
type ProductRow = {
  id: string;
  product: string;
  quantity: number;
  sales: number;
  cost: number;
  profit: number;
  margin: number;
};

function Reports() {
  const { db } = useErp();
  const dates = db.salesInvoices.map((invoice) => invoice.date).sort();
  const [from, setFrom] = useState(dates[0] ?? "");
  const [to, setTo] = useState(dates.at(-1) ?? "");
  const [branch, setBranch] = useState("ALL");
  const [product, setProduct] = useState("ALL");
  const [customer, setCustomer] = useState("ALL");
  const [backendRows, setBackendRows] = useState<ProductRow[] | null>(null);
  const [backendTrend, setBackendTrend] = useState<{ date: string; sales: number }[] | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const apiMode = Boolean(getApiTokens().access);
  const invoices = useMemo(
    () =>
      db.salesInvoices.filter(
        (invoice) =>
          invoice.status !== "Draft" &&
          invoice.status !== "Cancelled" &&
          (!from || invoice.date >= from) &&
          (!to || invoice.date <= to) &&
          (branch === "ALL" || invoice.locationId === branch) &&
          (customer === "ALL" || invoice.customerId === customer) &&
          (product === "ALL" || invoice.lines.some((line) => line.itemId === product)),
      ),
    [db.salesInvoices, from, to, branch, customer, product],
  );
  const localRows = useMemo(() => {
    const map = new Map<string, ProductRow>();
    invoices.forEach((invoice) =>
      invoice.lines
        .filter((line) => product === "ALL" || line.itemId === product)
        .forEach((line) => {
          const amount = lineAmounts(line);
          const current = map.get(line.itemId) ?? {
            id: line.itemId,
            product: db.products.find((item) => item.id === line.itemId)?.name ?? "Unknown product",
            quantity: 0,
            sales: 0,
            cost: 0,
            profit: 0,
            margin: 0,
          };
          current.quantity += line.qty;
          current.sales += amount.net;
          current.cost += line.qty * line.cost;
          current.profit = current.sales - current.cost;
          current.margin = current.sales ? (current.profit / current.sales) * 100 : 0;
          map.set(line.itemId, current);
        }),
    );
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [invoices, product, db.products]);
  const rows = apiMode ? (backendRows ?? []) : localRows;
  const total = rows.reduce((sum, row) => sum + row.sales, 0),
    cost = rows.reduce((sum, row) => sum + row.cost, 0),
    profitValue = total - cost,
    margin = total ? (profitValue / total) * 100 : 0;
  const localTrend = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach((invoice) =>
      invoice.lines
        .filter((line) => product === "ALL" || line.itemId === product)
        .forEach((line) =>
          map.set(invoice.date, (map.get(invoice.date) ?? 0) + lineAmounts(line).net),
        ),
    );
    return [...map]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sales]) => ({ date, sales }));
  }, [invoices, product]);
  const trend = apiMode ? (backendTrend ?? []) : localTrend;
  useEffect(() => {
    if (!getApiTokens().access) return;
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    if (branch !== "ALL") params.set("location", branch);
    if (product !== "ALL") params.set("finished_product", product);
    if (customer !== "ALL") params.set("customer", customer);
    params.set("page_size", "200");
    Promise.all([
      apiJson<{
        results: Array<{
          finished_product_id: string;
          finished_product__name: string;
          quantity: number;
          sales: number;
          cost: number;
          gross_profit: number;
        }>;
      }>(`${API_ENDPOINTS.reports.salesByProduct}?${params}`),
      apiJson<{ results: Array<{ period: string; sales: number }> }>(
        `${API_ENDPOINTS.reports.dailySales}?${params}`,
      ),
    ])
      .then(([products, daily]) => {
        setBackendRows(
          products.results.map((row) => ({
            id: String(row.finished_product_id),
            product: row.finished_product__name,
            quantity: Number(row.quantity),
            sales: Number(row.sales),
            cost: Number(row.cost),
            profit: Number(row.gross_profit),
            margin: Number(row.sales) ? (Number(row.gross_profit) / Number(row.sales)) * 100 : 0,
          })),
        );
        setBackendTrend(
          daily.results.map((row) => ({
            date: String(row.period).slice(0, 10),
            sales: Number(row.sales),
          })),
        );
      })
      .catch((error) => {
        setBackendRows([]);
        setBackendTrend([]);
        toast.error(error instanceof Error ? error.message : "Could not load reports");
      });
  }, [from, to, branch, product, customer]);
  async function exportCsv() {
    if (getApiTokens().access) {
      const params = new URLSearchParams({ export: "csv" });
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      if (branch !== "ALL") params.set("location", branch);
      if (product !== "ALL") params.set("finished_product", product);
      if (customer !== "ALL") params.set("customer", customer);
      const response = await apiFetch(`${API_ENDPOINTS.reports.salesByProduct}?${params}`);
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sales-by-product.csv";
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const csv = [
      ["Product", "Quantity", "Sales", "Cost", "Gross Profit", "Margin %"],
      ...rows.map((r) => [
        r.product,
        r.quantity,
        r.sales.toFixed(2),
        r.cost.toFixed(2),
        r.profit.toFixed(2),
        r.margin.toFixed(2),
      ]),
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sales-by-product.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function requestExcel() {
    if (!apiMode) return toast.error("Sign in to export Excel.");
    setExportPending(true);
    try {
      const filters: Record<string, string> = {};
      if (from) filters.date_from = from;
      if (to) filters.date_to = to;
      if (branch !== "ALL") filters.location = branch;
      if (product !== "ALL") filters.finished_product = product;
      if (customer !== "ALL") filters.customer = customer;
      const response = await apiFetch(API_ENDPOINTS.reportExports, {
        method: "POST",
        body: JSON.stringify({ report_name: "sales-by-product", format: "XLSX", filters }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not export Excel");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "sales-by-product.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Excel export downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export Excel");
    } finally {
      setExportPending(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Sales Analysis Report"
        subtitle="Review sales performance, costs and product profitability."
      />
      <PageBody>
        <Panel bodyClass="p-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[150px_150px_repeat(3,minmax(140px,1fr))_auto_auto]">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8"
              aria-label="From date"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8"
              aria-label="To date"
            />
            <ReportSelect
              value={branch}
              onChange={setBranch}
              label="All branches"
              options={db.locations
                .filter((l) => l.type === "branch" || l.type === "shop")
                .map((l) => [l.id, l.name])}
            />
            <ReportSelect
              value={product}
              onChange={setProduct}
              label="All products"
              options={db.products.map((p) => [p.id, p.name])}
            />
            <ReportSelect
              value={customer}
              onChange={setCustomer}
              label="All customers"
              options={db.customers.map((c) => [c.id, c.name])}
            />
            <Button size="sm" variant="outline" className="h-8">
              <Filter className="mr-1 h-3.5 w-3.5" />
              Filter
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={exportCsv}
              disabled={!rows.length}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={requestExcel}
              disabled={exportPending}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              {exportPending ? "Exporting…" : "Export Excel"}
            </Button>
          </div>
        </Panel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total Sales", aed(total)],
            ["Total Cost / COGS", aed(cost)],
            ["Gross Profit", aed(profitValue)],
            ["Gross Margin", `${margin.toFixed(1)}%`],
          ].map(([label, value], index) => (
            <Panel key={label} bodyClass="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p
                className={`mt-2 text-xl font-semibold tabular-nums ${index > 1 ? "text-success" : ""}`}
              >
                {value}
              </p>
            </Panel>
          ))}
        </div>
        <Panel title="Sales trend" description="Backend-authoritative posted sales">
          <div className="h-[270px]">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: 5, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(v) => aed(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#2563eb"
                    fill="#dbeafe"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </div>
        </Panel>
        <Panel
          title="Sales by product"
          description="Revenue and profitability for the selected period"
        >
          <p className="mb-2 text-[11px] text-muted-foreground sm:hidden">
            Swipe horizontally to see cost, profit and margin →
          </p>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[10px] uppercase text-muted-foreground">
                  {["Product", "Quantity", "Sales", "Cost", "Gross Profit", "Margin %"].map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="sticky left-0 bg-background px-3 py-2 font-medium shadow-[1px_0_0_hsl(var(--border))]">
                      {r.product}
                    </td>
                    <td className="px-3 py-2">{qty(r.quantity)}</td>
                    <td className="px-3 py-2">{aed(r.sales)}</td>
                    <td className="px-3 py-2">{aed(r.cost)}</td>
                    <td className="px-3 py-2 font-medium text-success">{aed(r.profit)}</td>
                    <td className="px-3 py-2">{r.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty />}
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
function ReportSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) {
  return (
    <select
      className="h-8 min-w-0 rounded-md border bg-background px-2 text-[12px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      <option value="ALL">{label}</option>
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}
function Empty() {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center text-center text-sm text-muted-foreground">
      <TrendingUp className="mb-2 h-7 w-7 opacity-40" />
      <p>No posted sales match these filters.</p>
    </div>
  );
}
