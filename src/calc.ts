import type { DB, Period, Purchase, Sale } from "./types";

export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
export const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ar-EG");
export const today = () => new Date().toISOString().slice(0, 10);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const nameOf = (arr: { id: string; name: string }[], id: string) =>
  arr.find((x) => x.id === id)?.name ?? "—";

export const saleTotal = (s: Sale) => sum(s.items, (i) => i.qty * i.price);
export const purchaseTotal = (p: Purchase) => sum(p.items, (i) => i.qty * i.cost);

export const inPeriod = (date: string, period: Period) => {
  if (period === "all") return true;
  const n = new Date();
  const d = new Date(date);
  if (period === "year") return d.getFullYear() === n.getFullYear();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
};

export const stockOf = (db: DB, pid: string) =>
  sum(db.purchases, (p) => sum(p.items.filter((i) => i.productId === pid), (i) => i.qty)) -
  sum(db.sales, (s) => sum(s.items.filter((i) => i.productId === pid), (i) => i.qty));

export const avgCost = (db: DB, pid: string) => {
  const lines = db.purchases.flatMap((p) => p.items).filter((i) => i.productId === pid);
  const q = sum(lines, (x) => x.qty);
  return q ? sum(lines, (x) => x.qty * x.cost) / q : 0;
};

export const saleDue = (s: Sale) => saleTotal(s) - s.paid;
export const purchaseDue = (p: Purchase) => purchaseTotal(p) - p.paid;

export const traderDebt = (db: DB, id: string) =>
  sum(db.sales.filter((x) => x.traderId === id), saleDue) -
  sum(db.payments.filter((p) => p.type === "trader" && p.partyId === id), (p) => p.amount);

export const supplierDebt = (db: DB, id: string) =>
  sum(db.purchases.filter((x) => x.supplierId === id), purchaseDue) -
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
  const P = db.purchases.filter((x) => inPeriod(x.date, period));
  const E = db.expenses.filter((x) => inPeriod(x.date, period));
  const PM = db.payments.filter((x) => inPeriod(x.date, period));

  const revenue = sum(S, saleTotal);
  const purchases = sum(P, purchaseTotal);
  const expenses = sum(E, (e) => e.amount);
  const cogs = sum(saleLines(S), (l) => l.qty * avgCost(db, l.productId));
  const gross = revenue - cogs;
  const net = gross - expenses;
  const collected =
    sum(S, (s) => s.paid) + sum(PM.filter((p) => p.type === "trader"), (p) => p.amount);
  const paidSuppliers =
    sum(P, (p) => p.paid) + sum(PM.filter((p) => p.type === "supplier"), (p) => p.amount);
  const cash = collected - paidSuppliers - expenses;

  return {
    S, E,
    revenue, purchases, expenses, gross, net, cash,
    owedByTraders: sum(db.traders, (t) => Math.max(0, traderDebt(db, t.id))),
    owedToSuppliers: sum(db.suppliers, (t) => Math.max(0, supplierDebt(db, t.id))),
    stockValue: sum(db.products, (p) => Math.max(0, stockOf(db, p.id)) * avgCost(db, p.id)),
  };
}

export function monthlySeries(db: DB) {
  const m: Record<string, { revenue: number; spending: number }> = {};
  const touch = (d: string) => (m[d.slice(0, 7)] ||= { revenue: 0, spending: 0 });
  db.sales.forEach((s) => (touch(s.date).revenue += saleTotal(s)));
  db.purchases.forEach((s) => (touch(s.date).spending += purchaseTotal(s)));
  db.expenses.forEach((s) => (touch(s.date).spending += s.amount));
  return Object.entries(m).sort().slice(-8);
}

/** أصناف مشتراة تاريخ صلاحيتها خلال `days` يوم (أو منتهية). */
export function expiringItems(db: DB, days = 90) {
  const limit = Date.now() + days * 86400000;
  return db.purchases
    .flatMap((p) => p.items.map((i) => ({ ...i, date: p.date })))
    .filter((i) => i.expiry && new Date(i.expiry).getTime() <= limit)
    .sort((a, b) => a.expiry!.localeCompare(b.expiry!));
}
