export const money = (n: number, dp = 2) =>
  (n < 0 ? "-" : "") +
  Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const aed = (n: number, dp = 2) => "AED " + money(n, dp);

export const qty = (n: number) =>
  n.toLocaleString("en-AE", { maximumFractionDigits: 3, minimumFractionDigits: 0 });

export const pct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;

export function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export const today = () => new Date().toISOString().slice(0, 10);
export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function startOf(range: string): [string, string] {
  const t = new Date();
  const end = t.toISOString().slice(0, 10);
  const d = new Date();
  switch (range) {
    case "today":
      return [end, end];
    case "yesterday": {
      d.setDate(d.getDate() - 1);
      const y = d.toISOString().slice(0, 10);
      return [y, y];
    }
    case "week":
      d.setDate(d.getDate() - 6);
      return [d.toISOString().slice(0, 10), end];
    case "month":
      d.setDate(1);
      return [d.toISOString().slice(0, 10), end];
    case "quarter":
      d.setDate(d.getDate() - 89);
      return [d.toISOString().slice(0, 10), end];
    default:
      d.setDate(d.getDate() - 29);
      return [d.toISOString().slice(0, 10), end];
  }
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
