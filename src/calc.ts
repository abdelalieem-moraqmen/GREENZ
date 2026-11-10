import type { BatchAllocation, DB, Period, Purchase, PurchaseReturn, Sale, SalesReturn } from "./types";

export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
export const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ar-EG");
export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const nameOf = (arr: { id: string; name: string }[], id: string) =>
  arr.find((x) => x.id === id)?.name ?? "—";

export const saleTotal = (s: Sale | SalesReturn) =>
  sum(s.items, (i) => i.qty * i.price) - ("discount" in s ? s.discount ?? 0 : 0);
export const purchaseTotal = (p: Purchase | PurchaseReturn) =>
  sum(p.items, (i) => i.qty * i.cost) - ("discount" in p ? p.discount ?? 0 : 0);

export const inPeriod = (date: string, period: Period) => {
  if (period === "all") return true;
  const n = new Date();
  const d = new Date(date);
  if (period === "year") return d.getFullYear() === n.getFullYear();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
};

const qtyOf = (items: { productId: string; qty: number }[], pid: string) =>
  sum(items.filter((i) => i.productId === pid), (i) => i.qty);

/** الكمية المتاحة إجمالاً = مشتريات − مبيعات + مرتجع مبيعات − مرتجع مشتريات. */
export const stockOf = (db: DB, pid: string) =>
  (db.products.find((p) => p.id === pid)?.openingQty ?? 0) +
  sum(db.purchases, (p) => qtyOf(p.items, pid)) -
  sum(db.sales, (s) => qtyOf(s.items, pid)) +
  sum(db.salesReturns, (s) => qtyOf(s.items, pid)) -
  sum(db.purchaseReturns, (s) => qtyOf(s.items, pid));

/** الكمية المتاحة في مخزن معين ("" = المخزن الرئيسي). */
export const stockInWarehouse = (db: DB, pid: string, wid: string) => {
  const inW = <T extends { warehouseId?: string }>(a: T[]) => a.filter((x) => (x.warehouseId ?? "") === wid);
  return (
    (wid === "" ? db.products.find((p) => p.id === pid)?.openingQty ?? 0 : 0) +
    sum(inW(db.purchases), (p) => qtyOf(p.items, pid)) -
    sum(inW(db.sales), (s) => qtyOf(s.items, pid)) +
    sum(inW(db.salesReturns), (s) => qtyOf(s.items, pid)) -
    sum(inW(db.purchaseReturns), (s) => qtyOf(s.items, pid)) +
    sum(db.transfers.filter((t) => t.toId === wid), (t) => qtyOf(t.items, pid)) -
    sum(db.transfers.filter((t) => t.fromId === wid), (t) => qtyOf(t.items, pid))
  );
};

export const avgCost = (db: DB, pid: string) => {
  const lines = db.purchases.flatMap((p) => p.items).filter((i) => i.productId === pid);
  const product = db.products.find((item) => item.id === pid);
  const openingQty = product?.openingQty ?? 0;
  const totalQty = openingQty + sum(lines, (x) => x.qty);
  const totalCost = openingQty * (product?.openingCost ?? 0) + sum(lines, (x) => x.qty * x.cost);
  return totalQty ? totalCost / totalQty : 0;
};

export const saleDue = (s: Sale) => saleTotal(s) - s.paid;
export const purchaseDue = (p: Purchase) => purchaseTotal(p) - p.paid;

export const traderDebt = (db: DB, id: string) =>
  (db.traders.find((trader) => trader.id === id)?.openingBalance ?? 0) +
  sum(db.sales.filter((x) => x.traderId === id), saleDue) -
  sum(db.salesReturns.filter((x) => x.traderId === id), saleTotal) -
  sum(db.payments.filter((p) => p.type === "trader" && p.partyId === id), (p) => p.amount);

export const supplierDebt = (db: DB, id: string) =>
  (db.suppliers.find((supplier) => supplier.id === id)?.openingBalance ?? 0) +
  sum(db.purchases.filter((x) => x.supplierId === id), purchaseDue) -
  sum(db.purchaseReturns.filter((x) => x.supplierId === id), purchaseTotal) -
  sum(db.payments.filter((p) => p.type === "supplier" && p.partyId === id), (p) => p.amount);

export function groupSum<T>(items: T[], key: (x: T) => string, val: (x: T) => number) {
  const m: Record<string, number> = {};
  items.forEach((i) => (m[key(i)] = (m[key(i)] || 0) + val(i)));
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

/** كل سطور البيع مع بيانات الفاتورة (للتجميع حسب الصنف). */
export const saleLines = (sales: Sale[]) =>
  sales.flatMap((s) => s.items.map((i) => ({ ...i, sale: s })));

export function computeSummary(db: DB, period: Period) {
  const S = db.sales.filter((x) => inPeriod(x.date, period));
  const SR = db.salesReturns.filter((x) => inPeriod(x.date, period));
  const P = db.purchases.filter((x) => inPeriod(x.date, period));
  const PR = db.purchaseReturns.filter((x) => inPeriod(x.date, period));
  const E = db.expenses.filter((x) => inPeriod(x.date, period));
  const PM = db.payments.filter((x) => inPeriod(x.date, period));

  const returnsValue = sum(SR, saleTotal);
  const revenue = sum(S, saleTotal) - returnsValue; // صافي بعد المرتجعات
  const purchases = sum(P, purchaseTotal) - sum(PR, purchaseTotal);
  const expenses = sum(E, (e) => e.amount);
  const cogs =
    sum(saleLines(S), (l) => l.qty * avgCost(db, l.productId)) -
    sum(SR.flatMap((r) => r.items), (l) => l.qty * avgCost(db, l.productId));
  const gross = revenue - cogs;
  const net = gross - expenses;
  const collected =
    sum(S, (s) => s.paid) + sum(PM.filter((p) => p.type === "trader"), (p) => p.amount);
  const paidSuppliers =
    sum(P, (p) => p.paid) + sum(PM.filter((p) => p.type === "supplier"), (p) => p.amount);
  const cash = collected - paidSuppliers - expenses;

  return {
    S, E,
    revenue, purchases, expenses, gross, net, cash, returnsValue,
    owedByTraders: sum(db.traders, (t) => Math.max(0, traderDebt(db, t.id))),
    owedToSuppliers: sum(db.suppliers, (t) => Math.max(0, supplierDebt(db, t.id))),
    stockValue: sum(db.products, (p) => Math.max(0, stockOf(db, p.id)) * avgCost(db, p.id)),
  };
}

export function monthlySeries(db: DB) {
  const m: Record<string, { revenue: number; spending: number }> = {};
  const touch = (d: string) => (m[d.slice(0, 7)] ||= { revenue: 0, spending: 0 });
  db.sales.forEach((s) => (touch(s.date).revenue += saleTotal(s)));
  db.salesReturns.forEach((s) => (touch(s.date).revenue -= saleTotal(s)));
  db.purchases.forEach((s) => (touch(s.date).spending += purchaseTotal(s)));
  db.purchaseReturns.forEach((s) => (touch(s.date).spending -= purchaseTotal(s)));
  db.expenses.forEach((s) => (touch(s.date).spending += s.amount));
  return Object.entries(m).sort().slice(-8);
}

export interface Batch {
  id: string;
  productId: string;
  batchNumber: string;
  supplierId?: string;
  supplierName: string;
  warehouseId: string;
  invoiceNumber?: string;
  expiry?: string;
  received: number;
  remaining: number;
  date: string;
  tracked: boolean;
}

interface BatchReplayOptions {
  excludeSaleId?: string;
  excludeSalesReturnId?: string;
  excludePurchaseReturnId?: string;
  excludeTransferId?: string;
}

interface BatchEvent {
  date: string;
  priority: number;
  id: string;
  apply: (batches: Batch[]) => void;
}

const batchOrder = (a: Batch, b: Batch) =>
  (a.expiry ?? "9999-12-31").localeCompare(b.expiry ?? "9999-12-31") ||
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

function trackedBatch(
  batchId: string,
  productId: string,
  warehouseId: string,
  batchNumber: string,
  expiry: string | undefined,
  date: string,
  received: number,
  supplierId: string | undefined,
  supplierName: string,
  invoiceNumber?: string,
): Batch {
  return {
    id: batchId, productId, warehouseId, batchNumber, expiry, date, received, remaining: received,
    supplierId, supplierName, invoiceNumber, tracked: !!batchNumber && !!expiry && !!supplierId,
  };
}

function batchAllocationsFor(
  batches: Batch[],
  productId: string,
  warehouseId: string,
  qty: number,
  requested: BatchAllocation[] | undefined,
  allowExpired: boolean,
  supplierId?: string,
) {
  let remaining = qty;
  const taken: BatchAllocation[] = [];
  const eligible = batches.filter((batch) =>
    batch.productId === productId &&
    batch.warehouseId === warehouseId &&
    (!supplierId || batch.supplierId === supplierId) &&
    (allowExpired || !batch.expiry || batch.expiry >= today()),
  );
  const take = (batch: Batch, amount: number) => {
    const actual = Math.min(batch.remaining, amount, remaining);
    if (actual <= 0) return;
    batch.remaining -= actual;
    remaining -= actual;
    const previous = taken.find((allocation) => allocation.batchId === batch.id);
    if (previous) previous.qty += actual;
    else taken.push({ batchId: batch.id, qty: actual });
  };

  for (const allocation of requested ?? []) {
    if (remaining <= 0) break;
    const batch = eligible.find((item) => item.id === allocation.batchId);
    if (batch) take(batch, allocation.qty);
  }
  for (const batch of eligible.sort(batchOrder)) {
    if (remaining <= 0) break;
    take(batch, remaining);
  }
  return { allocations: taken, remaining };
}

function addReturnedBatch(
  batches: Batch[],
  productId: string,
  warehouseId: string,
  allocation: BatchAllocation,
  date: string,
  label: string,
) {
  let batch = batches.find((item) => item.id === allocation.batchId && item.warehouseId === warehouseId);
  if (!batch) {
    const source = batches.find((item) => item.id === allocation.batchId);
    batch = trackedBatch(
      allocation.batchId, productId, warehouseId,
      source?.batchNumber ?? label, source?.expiry, source?.date ?? date,
      0, source?.supplierId, source?.supplierName ?? "", source?.invoiceNumber,
    );
    batches.push(batch);
  }
  batch.received += allocation.qty;
  batch.remaining += allocation.qty;
}

export function batchesRemaining(db: DB, options: BatchReplayOptions = {}): Batch[] {
  const batches: Batch[] = db.products.flatMap((product) => {
    const qty = product.openingQty ?? 0;
    return qty > 0 ? [trackedBatch(
      `opening:${product.id}`, product.id, "", "رصيد افتتاحي", undefined, "0000-00-00",
      qty, undefined, "غير معروف",
    )] : [];
  });
  const events: BatchEvent[] = [];

  db.purchases.forEach((purchase) => purchase.items.forEach((line, index) => {
    events.push({
      date: purchase.date, priority: 0, id: `${purchase.id}:${index}`,
      apply: (stock) => stock.push(trackedBatch(
        line.batchId || `legacy:${purchase.id}:${index}`,
        line.productId,
        purchase.warehouseId ?? "",
        line.batchNumber?.trim() || "تشغيلة غير مسجلة",
        line.expiry || undefined,
        purchase.date,
        line.qty,
        purchase.supplierId,
        nameOf(db.suppliers, purchase.supplierId),
        purchase.invoiceNumber,
      )),
    });
  }));
  db.sales.forEach((sale) => {
    if (sale.id === options.excludeSaleId) return;
    sale.items.forEach((line, index) => events.push({
      date: sale.date, priority: 2, id: `${sale.id}:${index}`,
      apply: (stock) => { batchAllocationsFor(
        stock, line.productId, sale.warehouseId ?? "", line.qty, line.batchAllocations, true,
      ); },
    }));
  });
  db.salesReturns.forEach((entry) => {
    if (entry.id === options.excludeSalesReturnId) return;
    entry.items.forEach((line, index) => events.push({
      date: entry.date, priority: 3, id: `${entry.id}:${index}`,
      apply: (stock) => {
        const allocations = line.batchAllocations?.length
          ? line.batchAllocations
          : [{ batchId: `untracked-sales-return:${entry.id}:${index}`, qty: line.qty }];
        for (const allocation of allocations)
          addReturnedBatch(stock, line.productId, entry.warehouseId ?? "", allocation, entry.date, "مرتجع غير متتبع");
      },
    }));
  });
  db.transfers.forEach((transfer) => {
    if (transfer.id === options.excludeTransferId) return;
    transfer.items.forEach((line, index) => events.push({
      date: transfer.date, priority: 1, id: `${transfer.id}:${index}`,
      apply: (stock) => {
        const moved = batchAllocationsFor(
          stock, line.productId, transfer.fromId, line.qty, line.batchAllocations, true,
        ).allocations;
        for (const allocation of moved) {
          const source = stock.find((batch) => batch.id === allocation.batchId && batch.warehouseId === transfer.fromId);
          if (source) addReturnedBatch(stock, line.productId, transfer.toId, allocation, transfer.date, "تحويل غير متتبع");
        }
      },
    }));
  });
  db.purchaseReturns.forEach((entry) => {
    if (entry.id === options.excludePurchaseReturnId) return;
    entry.items.forEach((line, index) => events.push({
      date: entry.date, priority: 4, id: `${entry.id}:${index}`,
      apply: (stock) => { batchAllocationsFor(
        stock, line.productId, entry.warehouseId ?? "", line.qty,
        line.batchAllocations, true, entry.supplierId,
      ); },
    }));
  });

  events.sort((a, b) => a.date.localeCompare(b.date) || a.priority - b.priority || a.id.localeCompare(b.id));
  events.forEach((event) => event.apply(batches));
  return batches.filter((batch) => batch.remaining > 0);
}

export function batchNumberOf(db: DB, batchId: string) {
  for (const purchase of db.purchases) {
    const index = purchase.items.findIndex((line, lineIndex) =>
      (line.batchId || `legacy:${purchase.id}:${lineIndex}`) === batchId);
    if (index >= 0) return purchase.items[index].batchNumber?.trim() || "تشغيلة غير مسجلة";
  }
  if (batchId.startsWith("opening:")) return "رصيد افتتاحي غير متتبع";
  return "مرتجع/تحويل غير متتبع";
}

export function allocateFefo(
  db: DB,
  productId: string,
  qty: number,
  warehouseId: string,
  options: BatchReplayOptions & { supplierId?: string; allowExpired?: boolean } = {},
) {
  const candidates = batchesRemaining(db, options)
    .filter((batch) => batch.productId === productId && batch.warehouseId === warehouseId)
    .sort(batchOrder);
  const expiredQty = candidates
    .filter((batch) => batch.expiry && batch.expiry < today())
    .reduce((total, batch) => total + batch.remaining, 0);
  let remaining = qty;
  const allocations: BatchAllocation[] = [];
  for (const batch of candidates) {
    if (options.supplierId && batch.supplierId !== options.supplierId) continue;
    if (!options.allowExpired && batch.expiry && batch.expiry < today()) continue;
    const amount = Math.min(remaining, batch.remaining);
    if (amount <= 0) continue;
    allocations.push({ batchId: batch.id, qty: amount });
    remaining -= amount;
    if (remaining <= 0) break;
  }
  return {
    allocations,
    available: qty - remaining,
    missing: remaining,
    expiredQty,
  };
}

export function allocateSalesReturn(
  db: DB,
  productId: string,
  qty: number,
  traderId: string,
  warehouseId: string,
  excludeSalesReturnId?: string,
  returnDate = today(),
) {
  const soldByBatch = new Map<string, number>();
  let legacySold = 0;
  for (const sale of db.sales) {
    if (sale.date > returnDate || sale.traderId !== traderId || (sale.warehouseId ?? "") !== warehouseId) continue;
    for (const line of sale.items) {
      if (line.productId !== productId) continue;
      if (!line.batchAllocations?.length) {
        legacySold += line.qty;
        continue;
      }
      for (const allocation of line.batchAllocations ?? [])
        soldByBatch.set(allocation.batchId, (soldByBatch.get(allocation.batchId) ?? 0) + allocation.qty);
    }
  }
  let legacyReturned = 0;
  for (const entry of db.salesReturns) {
    if (entry.id === excludeSalesReturnId || entry.traderId !== traderId ||
      entry.date > returnDate || (entry.warehouseId ?? "") !== warehouseId) continue;
    for (const line of entry.items) {
      if (line.productId !== productId) continue;
      if (!line.batchAllocations?.length) {
        legacyReturned += line.qty;
        continue;
      }
      for (const allocation of line.batchAllocations ?? [])
        soldByBatch.set(allocation.batchId, Math.max(0, (soldByBatch.get(allocation.batchId) ?? 0) - allocation.qty));
    }
  }

  const batchOrderById = new Map(batchesRemaining(db).map((batch) => [batch.id, batch]));
  const batches = [...soldByBatch.entries()]
    .map(([batchId, available]) => ({ batchId, available, batch: batchOrderById.get(batchId) }))
    .filter((entry) => entry.available > 0)
    .sort((a, b) => {
      if (a.batch && b.batch) return batchOrder(a.batch, b.batch);
      return a.batch ? -1 : b.batch ? 1 : a.batchId.localeCompare(b.batchId);
    });
  let remaining = qty;
  const allocations: BatchAllocation[] = [];
  for (const batch of batches) {
    const amount = Math.min(remaining, batch.available);
    if (amount > 0) allocations.push({ batchId: batch.batchId, qty: amount });
    remaining -= amount;
    if (remaining <= 0) break;
  }
  const untrackedAvailable = Math.max(0, legacySold - legacyReturned);
  return {
    allocations,
    missing: remaining,
    untrackedAvailable,
    excess: Math.max(0, remaining - untrackedAvailable),
  };
}

/** التشغيلات التي تنتهي خلال 90 يوماً، بما فيها المنتهية بالفعل. */
export function expiringBatches(db: DB, days = 90) {
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() + days);
  const limitDate = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, "0")}-${String(limit.getDate()).padStart(2, "0")}`;
  return batchesRemaining(db)
    .filter((batch) => batch.expiry && batch.expiry <= limitDate)
    .sort((a, b) => a.expiry!.localeCompare(b.expiry!) || a.batchNumber.localeCompare(b.batchNumber));
}
