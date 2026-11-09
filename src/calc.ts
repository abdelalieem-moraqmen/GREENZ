import type { DB, Period, Purchase, PurchaseReturn, Sale, SalesReturn } from "./types";

export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
export const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ar-EG");
export const today = () => new Date().toISOString().slice(0, 10);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const nameOf = (arr: { id: string; name: string }[], id: string) =>
  arr.find((x) => x.id === id)?.name ?? "—";

export const saleTotal = (s: Sale | SalesReturn) => sum(s.items, (i) => i.qty * i.price);
export const purchaseTotal = (p: Purchase | PurchaseReturn) => sum(p.items, (i) => i.qty * i.cost);

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
  sum(db.purchases, (p) => qtyOf(p.items, pid)) -
  sum(db.sales, (s) => qtyOf(s.items, pid)) +
  sum(db.salesReturns, (s) => qtyOf(s.items, pid)) -
  sum(db.purchaseReturns, (s) => qtyOf(s.items, pid));

/** الكمية المتاحة في مخزن معين ("" = المخزن الرئيسي). */
export const stockInWarehouse = (db: DB, pid: string, wid: string) => {
  const inW = <T extends { warehouseId?: string }>(a: T[]) => a.filter((x) => (x.warehouseId ?? "") === wid);
  return (
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
  const q = sum(lines, (x) => x.qty);
  return q ? sum(lines, (x) => x.qty * x.cost) / q : 0;
};

export const saleDue = (s: Sale) => saleTotal(s) - s.paid;
export const purchaseDue = (p: Purchase) => purchaseTotal(p) - p.paid;

export const traderDebt = (db: DB, id: string) =>
  sum(db.sales.filter((x) => x.traderId === id), saleDue) -
  sum(db.salesReturns.filter((x) => x.traderId === id), saleTotal) -
  sum(db.payments.filter((p) => p.type === "trader" && p.partyId === id), (p) => p.amount);

export const supplierDebt = (db: DB, id: string) =>
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
  productId: string;
  expiry?: string;
  received: number;
  remaining: number;
  date: string;
}

/**
 * تشغيلات المخزون بنظام FEFO: الخارج من المخزن (مبيعات − مرتجع مبيعات + مرتجع مشتريات)
 * يُخصم من أقرب تاريخ صلاحية أولاً. الباقي في كل تشغيلة = المتبقي فعلياً.
 */
export function batchesRemaining(db: DB): Batch[] {
  const out: Batch[] = [];
  db.products.forEach((p) => {
    const batches: Batch[] = db.purchases
      .flatMap((pu) => pu.items.filter((i) => i.productId === p.id).map((i) => ({
        productId: p.id, expiry: i.expiry || undefined, received: i.qty, remaining: i.qty, date: pu.date,
      })))
      .sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
    let outflow =
      sum(db.sales, (s) => qtyOf(s.items, p.id)) -
      sum(db.salesReturns, (s) => qtyOf(s.items, p.id)) +
      sum(db.purchaseReturns, (s) => qtyOf(s.items, p.id));
    for (const b of batches) {
      const take = Math.min(b.remaining, Math.max(0, outflow));
      b.remaining -= take;
      outflow -= take;
    }
    out.push(...batches);
  });
  return out;
}

/** تشغيلات متبقي منها كمية وصلاحيتها خلال `days` يوم (أو منتهية). */
export function expiringBatches(db: DB, days = 90) {
  const limit = Date.now() + days * 86400000;
  return batchesRemaining(db)
    .filter((b) => b.remaining > 0 && b.expiry && new Date(b.expiry).getTime() <= limit)
    .sort((a, b) => a.expiry!.localeCompare(b.expiry!));
}
