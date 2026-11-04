import type { Database, LedgerEntry } from "./types";

export const TRANSIT = "L-TRANSIT";
export const DAMAGED = "L-DAMAGED";

/** Weighted average purchase cost per raw material (posted purchases only). */
export function rawMaterialCosts(db: Database): Record<string, number> {
  const acc: Record<string, { qty: number; val: number }> = {};
  for (const pi of db.purchaseInvoices) {
    if (pi.status === "Cancelled" || pi.status === "Draft") continue;
    for (const l of pi.lines) {
      acc[l.itemId] = acc[l.itemId] || { qty: 0, val: 0 };
      acc[l.itemId].qty += l.qty;
      acc[l.itemId].val += l.qty * l.rate * (1 - l.discount / 100);
    }
  }
  const out: Record<string, number> = {};
  for (const rm of db.rawMaterials) {
    const a = acc[rm.id];
    out[rm.id] = a && a.qty > 0 ? a.val / a.qty : rm.standardCost;
  }
  return out;
}

export function lastPurchaseRate(db: Database, itemId: string): number | null {
  const rows = db.purchaseInvoices
    .filter(
      (p) =>
        p.status !== "Draft" &&
        p.status !== "Cancelled" &&
        p.lines.some((l) => l.itemId === itemId),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = rows[rows.length - 1];
  return last ? last.lines.find((l) => l.itemId === itemId)!.rate : null;
}

/** Historical production-record costs, retained for production audit views. */
export function batchCosts(db: Database): Record<string, number> {
  const costs = rawMaterialCosts(db);
  const map: Record<string, number> = {};
  for (const b of db.productionBatches) {
    if (b.status !== "Completed") continue;
    const total = b.materials.reduce(
      (s, m) => s + m.actualQty * (costs[m.itemId] ?? m.unitCost),
      0,
    );
    map[b.batchNo] = b.producedQty > 0 ? total / b.producedQty : 0;
  }
  return map;
}

export function productionCost(db: Database, batchId: string) {
  const costs = rawMaterialCosts(db);
  const b = db.productionBatches.find((x) => x.id === batchId);
  if (!b) return { material: 0, total: 0, perUnit: 0 };
  const material = b.materials.reduce(
    (s, m) => s + m.actualQty * (costs[m.itemId] ?? m.unitCost),
    0,
  );
  const total = material;
  return { material, total, perUnit: b.producedQty ? total / b.producedQty : 0 };
}

/** Weighted average finished-product cost across completed production records. */
export function finishedProductCosts(db: Database): Record<string, number> {
  const acc: Record<string, { qty: number; value: number }> = {};
  for (const record of db.productionBatches) {
    if (record.status !== "Completed" || record.producedQty <= 0) continue;
    const cost = productionCost(db, record.id);
    const current = (acc[record.productId] ??= { qty: 0, value: 0 });
    current.qty += record.producedQty;
    current.value += cost.total;
  }
  return Object.fromEntries(
    db.products.map((product) => {
      const current = acc[product.id];
      return [product.id, current?.qty > 0 ? current.value / current.qty : product.standardCost];
    }),
  );
}

function e(p: Partial<LedgerEntry> & { id: string; ts: string }): LedgerEntry {
  return {
    txnNo: "",
    type: "",
    refType: "",
    refId: "",
    refNo: "",
    itemId: "",
    itemType: "RM",
    batch: "",
    locationId: "",
    qtyIn: 0,
    qtyOut: 0,
    unitCost: 0,
    value: 0,
    user: "System",
    status: "Posted",
    ...p,
  } as LedgerEntry;
}

/** The single source of truth: all stock movements derived from documents. */
export function buildLedger(db: Database): LedgerEntry[] {
  if (db.stockLedger?.length) return db.stockLedger;

  const rmCost = rawMaterialCosts(db);
  const productCost = finishedProductCosts(db);
  const fgCost = (itemId: string, _historicalBatch?: string) => productCost[itemId] ?? 0;
  const out: LedgerEntry[] = [];

  for (const opening of db.openingStocks ?? []) {
    out.push(
      e({
        id: `${opening.id}-L`,
        ts: opening.date + "T00:00",
        txnNo: opening.no,
        type: "Opening Stock",
        refType: "Opening Stock",
        refId: opening.id,
        refNo: opening.no,
        itemId: opening.itemId,
        itemType: opening.itemType,
        locationId: opening.locationId,
        toId: opening.locationId,
        qtyIn: opening.qty,
        unitCost: opening.unitCost,
        value: opening.qty * opening.unitCost,
        user: opening.createdBy,
        status: opening.status,
      }),
    );
  }

  for (const pi of db.purchaseInvoices) {
    if (pi.status === "Draft") continue;
    pi.lines.forEach((l, i) => {
      out.push(
        e({
          id: `${pi.id}-L${i}`,
          ts: pi.date + "T09:00",
          txnNo: pi.no,
          type: "Purchase",
          refType: "Purchase Invoice",
          refId: pi.id,
          refNo: pi.no,
          itemId: l.itemId,
          itemType: "RM",
          locationId: pi.warehouseId,
          toId: pi.warehouseId,
          qtyIn: l.qty,
          unitCost: l.rate,
          value: l.qty * l.rate,
          user: pi.createdBy,
          status: pi.status,
        }),
      );
      if (pi.status === "Cancelled") {
        out.push(
          e({
            id: `${pi.id}-RV${i}`,
            ts: pi.date + "T09:05",
            txnNo: pi.no + "-REV",
            type: "Purchase Reversal",
            refType: "Purchase Invoice",
            refId: pi.id,
            refNo: pi.no,
            itemId: l.itemId,
            itemType: "RM",
            locationId: pi.warehouseId,
            fromId: pi.warehouseId,
            qtyOut: l.qty,
            unitCost: l.rate,
            value: -l.qty * l.rate,
            user: pi.createdBy,
            status: "Cancelled",
          }),
        );
      }
    });
  }

  for (const mt of db.materialTransfers) {
    const dispatched = ["Dispatched", "Received"].includes(mt.status);
    if (!dispatched) continue;
    mt.lines.forEach((l, i) => {
      const cost = rmCost[l.itemId] ?? 0;
      out.push(
        e({
          id: `${mt.id}-O${i}`,
          ts: mt.date + "T10:00",
          txnNo: mt.no,
          type: "Raw-Material Transfer",
          refType: "Material Transfer",
          refId: mt.id,
          refNo: mt.no,
          itemId: l.itemId,
          itemType: "RM",
          locationId: mt.fromId,
          fromId: mt.fromId,
          toId: mt.toId,
          qtyOut: l.qty,
          unitCost: cost,
          value: -l.qty * cost,
          user: mt.createdBy,
          status: mt.status,
        }),
      );
      if (mt.status === "Received") {
        out.push(
          e({
            id: `${mt.id}-I${i}`,
            ts: mt.date + "T10:05",
            txnNo: mt.no,
            type: "Raw-Material Transfer",
            refType: "Material Transfer",
            refId: mt.id,
            refNo: mt.no,
            itemId: l.itemId,
            itemType: "RM",
            locationId: mt.toId,
            fromId: mt.fromId,
            toId: mt.toId,
            qtyIn: l.qty,
            unitCost: cost,
            value: l.qty * cost,
            user: mt.createdBy,
            status: mt.status,
          }),
        );
      }
    });
  }

  for (const b of db.productionBatches) {
    if (b.status !== "Completed") continue;
    b.materials.forEach((m, i) => {
      const cost = rmCost[m.itemId] ?? m.unitCost;
      out.push(
        e({
          id: `${b.id}-C${i}`,
          ts: b.date + "T12:00",
          txnNo: b.no,
          type: "Production Consumption",
          refType: "Production Batch",
          refId: b.id,
          refNo: b.no,
          itemId: m.itemId,
          itemType: "RM",
          locationId: b.productionLocationId,
          fromId: b.productionLocationId,
          qtyOut: m.actualQty,
          unitCost: cost,
          value: -m.actualQty * cost,
          user: b.createdBy,
          status: "Completed",
        }),
      );
    });
    const pc = productionCost(db, b.id);
    out.push(
      e({
        id: `${b.id}-OUT`,
        ts: b.date + "T12:30",
        txnNo: b.no,
        type: "Production Output",
        refType: "Production Batch",
        refId: b.id,
        refNo: b.no,
        itemId: b.productId,
        itemType: "FG",
        batch: b.batchNo,
        locationId: b.fgLocationId,
        toId: b.fgLocationId,
        qtyIn: b.producedQty,
        unitCost: pc.perUnit,
        value: pc.total,
        user: b.createdBy,
        status: "Completed",
      }),
    );
  }

  for (const t of db.stockTransfers) {
    const dispatched = ["Dispatched", "In Transit", "Received", "Partially Received"].includes(
      t.status,
    );
    if (!dispatched) continue;
    t.lines.forEach((l, i) => {
      const cost = fgCost(l.itemId, l.batch);
      out.push(
        e({
          id: `${t.id}-O${i}`,
          ts: (t.dispatchDate || t.date) + "T14:00",
          txnNo: t.no,
          type: "Finished-Goods Transfer",
          refType: "Stock Transfer",
          refId: t.id,
          refNo: t.no,
          itemId: l.itemId,
          itemType: "FG",
          batch: l.batch,
          locationId: t.fromId,
          fromId: t.fromId,
          toId: TRANSIT,
          qtyOut: l.qty,
          unitCost: cost,
          value: -l.qty * cost,
          user: t.createdBy,
          status: t.status,
        }),
      );
      out.push(
        e({
          id: `${t.id}-T${i}`,
          ts: (t.dispatchDate || t.date) + "T14:01",
          txnNo: t.no,
          type: "Finished-Goods Transfer",
          refType: "Stock Transfer",
          refId: t.id,
          refNo: t.no,
          itemId: l.itemId,
          itemType: "FG",
          batch: l.batch,
          locationId: TRANSIT,
          qtyIn: l.qty,
          unitCost: cost,
          value: l.qty * cost,
          user: t.createdBy,
          status: t.status,
        }),
      );
      if (["Received", "Partially Received"].includes(t.status)) {
        const recv = l.receivedQty ?? l.qty;
        const dmg = l.damagedQty ?? 0;
        out.push(
          e({
            id: `${t.id}-TO${i}`,
            ts: (t.receivedDate || t.date) + "T16:00",
            txnNo: t.no,
            type: "Finished-Goods Transfer",
            refType: "Stock Transfer",
            refId: t.id,
            refNo: t.no,
            itemId: l.itemId,
            itemType: "FG",
            batch: l.batch,
            locationId: TRANSIT,
            qtyOut: recv + dmg,
            unitCost: cost,
            value: -(recv + dmg) * cost,
            user: t.receivedBy || t.createdBy,
            status: t.status,
          }),
        );
        if (recv > 0)
          out.push(
            e({
              id: `${t.id}-I${i}`,
              ts: (t.receivedDate || t.date) + "T16:01",
              txnNo: t.no,
              type: "Finished-Goods Transfer",
              refType: "Stock Transfer",
              refId: t.id,
              refNo: t.no,
              itemId: l.itemId,
              itemType: "FG",
              batch: l.batch,
              locationId: t.toId,
              fromId: t.fromId,
              toId: t.toId,
              qtyIn: recv,
              unitCost: cost,
              value: recv * cost,
              user: t.receivedBy || t.createdBy,
              status: t.status,
            }),
          );
        if (dmg > 0) two(out, t, l, dmg, cost);
      }
    });
  }

  for (const inv of db.salesInvoices) {
    if (inv.status === "Draft") continue;
    inv.lines.forEach((l, i) => {
      const cost = fgCost(l.itemId, l.batch);
      out.push(
        e({
          id: `${inv.id}-L${i}`,
          ts: inv.date + "T15:00",
          txnNo: inv.no,
          type: "Sale",
          refType: "Sales Invoice",
          refId: inv.id,
          refNo: inv.no,
          itemId: l.itemId,
          itemType: "FG",
          batch: l.batch,
          locationId: inv.locationId,
          fromId: inv.locationId,
          qtyOut: l.qty,
          unitCost: cost,
          value: -l.qty * cost,
          user: inv.createdBy,
          status: inv.status,
        }),
      );
      if (inv.status === "Cancelled") {
        out.push(
          e({
            id: `${inv.id}-RV${i}`,
            ts: inv.date + "T15:05",
            txnNo: inv.no + "-REV",
            type: "Sales Reversal",
            refType: "Sales Invoice",
            refId: inv.id,
            refNo: inv.no,
            itemId: l.itemId,
            itemType: "FG",
            batch: l.batch,
            locationId: inv.locationId,
            toId: inv.locationId,
            qtyIn: l.qty,
            unitCost: cost,
            value: l.qty * cost,
            user: inv.createdBy,
            status: "Cancelled",
          }),
        );
      }
    });
  }

  for (const r of db.salesReturns) {
    if (r.status === "Draft") continue;
    r.lines.forEach((l, i) => {
      const cost = fgCost(l.itemId, l.batch);
      const saleable = l.condition === "Saleable";
      out.push(
        e({
          id: `${r.id}-L${i}`,
          ts: r.date + "T11:00",
          txnNo: r.no,
          type: "Sales Return",
          refType: "Sales Return",
          refId: r.id,
          refNo: r.no,
          itemId: l.itemId,
          itemType: "FG",
          batch: l.batch,
          locationId: saleable ? r.locationId : DAMAGED,
          toId: saleable ? r.locationId : DAMAGED,
          qtyIn: l.qty,
          unitCost: cost,
          value: l.qty * cost,
          user: r.createdBy,
          status: r.status,
        }),
      );
    });
  }

  for (const w of db.wastages) {
    if (w.status === "Draft") continue;
    const cost = w.itemType === "RM" ? (rmCost[w.itemId] ?? 0) : fgCost(w.itemId, "");
    out.push(
      e({
        id: `${w.id}-L`,
        ts: w.date + "T17:00",
        txnNo: w.no,
        type:
          w.wastageType === "Expiry" ? "Expiry" : w.wastageType === "Damage" ? "Damage" : "Wastage",
        refType: "Wastage",
        refId: w.id,
        refNo: w.no,
        itemId: w.itemId,
        itemType: w.itemType,
        locationId: w.locationId,
        fromId: w.locationId,
        qtyOut: w.qty,
        unitCost: cost,
        value: -w.qty * cost,
        user: w.createdBy,
        status: w.status,
      }),
    );
  }

  for (const a of db.stockAdjustments) {
    if (a.status === "Draft") continue;
    const cost = a.itemType === "RM" ? (rmCost[a.itemId] ?? 0) : fgCost(a.itemId, a.batch);
    out.push(
      e({
        id: `${a.id}-L`,
        ts: a.date + "T18:00",
        txnNo: a.no,
        type: "Stock Adjustment",
        refType: "Stock Adjustment",
        refId: a.id,
        refNo: a.no,
        itemId: a.itemId,
        itemType: a.itemType,
        batch: a.batch,
        locationId: a.locationId,
        qtyIn: a.qty > 0 ? a.qty : 0,
        qtyOut: a.qty < 0 ? -a.qty : 0,
        unitCost: cost,
        value: a.qty * cost,
        user: a.createdBy,
        status: a.status,
      }),
    );
  }

  return out.sort((x, y) => x.ts.localeCompare(y.ts) || x.id.localeCompare(y.id));
}

function two(
  out: LedgerEntry[],
  t: {
    id: string;
    no: string;
    date: string;
    receivedDate?: string;
    createdBy: string;
    toId: string;
    status: string;
  },
  l: { itemId: string; batch: string },
  dmg: number,
  cost: number,
) {
  out.push(
    e({
      id: `${t.id}-D-${l.itemId}-${l.batch}`,
      ts: (t.receivedDate || t.date) + "T16:02",
      txnNo: t.no,
      type: "Damage",
      refType: "Stock Transfer",
      refId: t.id,
      refNo: t.no,
      itemId: l.itemId,
      itemType: "FG",
      batch: l.batch,
      locationId: DAMAGED,
      toId: DAMAGED,
      qtyIn: dmg,
      unitCost: cost,
      value: dmg * cost,
      user: t.createdBy,
      status: t.status,
    }),
  );
}

export interface StockRow {
  itemId: string;
  itemType: "RM" | "FG";
  locationId: string;
  /** Always empty for live balances; batches remain only on historical ledger entries. */
  batch: string;
  qty: number;
  value: number;
}

export function stockRows(ledger: LedgerEntry[], upto?: string): StockRow[] {
  const map = new Map<string, StockRow>();
  for (const l of ledger) {
    if (upto && l.ts.slice(0, 10) > upto) continue;
    const key = `${l.itemId}|${l.locationId}`;
    const cur = map.get(key) || {
      itemId: l.itemId,
      itemType: l.itemType,
      locationId: l.locationId,
      batch: "",
      qty: 0,
      value: 0,
    };
    cur.qty += l.qtyIn - l.qtyOut;
    cur.value += (l.qtyIn - l.qtyOut) * l.unitCost;
    map.set(key, cur);
  }
  return [...map.values()].map((r) => ({ ...r, qty: Math.round(r.qty * 1000) / 1000 }));
}

export function stockOf(
  ledger: LedgerEntry[],
  itemId: string,
  locationId?: string,
  _historicalBatch?: string,
) {
  let q = 0;
  for (const l of ledger) {
    if (l.itemId !== itemId) continue;
    if (locationId && l.locationId !== locationId) continue;
    q += l.qtyIn - l.qtyOut;
  }
  return Math.round(q * 1000) / 1000;
}
