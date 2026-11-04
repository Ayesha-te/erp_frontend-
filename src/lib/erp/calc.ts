import type { Database, PurchaseInvoice, SalesInvoice, DocStatus } from "./types";

export interface LineLike {
  qty: number;
  rate?: number;
  price?: number;
  discount: number;
  taxRate: number;
}

export function lineAmounts(l: LineLike) {
  const unit = l.rate ?? l.price ?? 0;
  const gross = l.qty * unit;
  const discount = (gross * (l.discount || 0)) / 100;
  const net = gross - discount;
  const tax = (net * (l.taxRate || 0)) / 100;
  return { gross, discount, net, tax, total: net + tax };
}

export function docTotals(lines: LineLike[]) {
  return lines.reduce(
    (acc, l) => {
      const a = lineAmounts(l);
      acc.subtotal += a.gross;
      acc.discount += a.discount;
      acc.tax += a.tax;
      acc.total += a.total;
      return acc;
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 },
  );
}

export const purchaseTotal = (pi: PurchaseInvoice) => docTotals(pi.lines).total;
export const salesTotal = (si: SalesInvoice) => docTotals(si.lines).total;

export function salesProfit(si: SalesInvoice) {
  const t = docTotals(si.lines);
  const cogs = si.lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const revenue = t.subtotal - t.discount;
  return {
    cogs,
    revenue,
    profit: revenue - cogs,
    margin: revenue ? ((revenue - cogs) / revenue) * 100 : 0,
  };
}

export function paidFor(db: Database, kind: "purchase" | "sales", invoiceId: string) {
  const src = kind === "purchase" ? db.supplierPayments : db.customerPayments;
  return src
    .filter((p) => p.status !== "Cancelled")
    .reduce(
      (s, p) =>
        s +
        p.allocations.filter((a) => a.invoiceId === invoiceId).reduce((x, a) => x + a.amount, 0),
      0,
    );
}

export function invoiceStatus(
  base: DocStatus,
  total: number,
  paid: number,
  dueDate: string,
): DocStatus {
  if (base !== "Posted") return base;
  if (paid >= total - 0.01) return "Paid";
  if (paid > 0.01) return "Partially Paid";
  if (dueDate < new Date().toISOString().slice(0, 10)) return "Overdue";
  return "Posted";
}

export function supplierBalance(db: Database, supplierId: string) {
  const sup = db.suppliers.find((s) => s.id === supplierId);
  const invoices = db.purchaseInvoices.filter(
    (p) => p.supplierId === supplierId && p.status !== "Draft" && p.status !== "Cancelled",
  );
  const billed = invoices.reduce((s, p) => s + purchaseTotal(p), 0);
  const paid = db.supplierPayments
    .filter((p) => p.partyId === supplierId && p.status !== "Cancelled")
    .reduce((s, p) => s + p.amount, 0);
  const opening = sup?.openingBalance ?? 0;
  return { opening, billed, paid, outstanding: opening + billed - paid };
}

export function customerBalance(db: Database, customerId: string) {
  const cus = db.customers.find((c) => c.id === customerId);
  const invoices = db.salesInvoices.filter(
    (p) => p.customerId === customerId && p.status !== "Draft" && p.status !== "Cancelled",
  );
  const billed = invoices.reduce((s, p) => s + salesTotal(p), 0);
  const paid = db.customerPayments
    .filter((p) => p.partyId === customerId && p.status !== "Cancelled")
    .reduce((s, p) => s + p.amount, 0);
  const returns = db.salesReturns
    .filter((r) => r.customerId === customerId && r.status !== "Draft")
    .reduce((s, r) => s + r.lines.reduce((x, l) => x + l.amount, 0), 0);
  const opening = cus?.openingBalance ?? 0;
  return { opening, billed, paid, returns, outstanding: opening + billed - paid - returns };
}

export function totalReceivables(db: Database) {
  return db.customers.reduce((s, c) => s + customerBalance(db, c.id).outstanding, 0);
}
export function totalPayables(db: Database) {
  return db.suppliers.reduce((s, x) => s + supplierBalance(db, x.id).outstanding, 0);
}

/** Remaining returnable quantity for an invoice line. */
export function returnableQty(db: Database, invoiceId: string, itemId: string) {
  const inv = db.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv) return 0;
  const sold = inv.lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0);
  const returned = db.salesReturns
    .filter((r) => r.invoiceId === invoiceId && r.status !== "Cancelled")
    .reduce(
      (s, r) => s + r.lines.filter((l) => l.itemId === itemId).reduce((x, l) => x + l.qty, 0),
      0,
    );
  return { sold, returned, remaining: sold - returned };
}
