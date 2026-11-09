import {
  avgCost, batchesRemaining, fmt, inPeriod, monthlySeries, nameOf, purchaseDue, purchaseTotal, saleDue, saleTotal,
  stockInWarehouse, stockOf, supplierDebt, sum, traderDebt,
} from "./calc";
import { MAIN_WAREHOUSE } from "./constants";
import { openPrint } from "./print";
import type { DB, Period } from "./types";

export interface Report {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export type ReportKey = "sales" | "purchases" | "expenses" | "stock" | "debts" | "batches" | "monthly";

export const REPORT_LIST: { key: ReportKey; label: string }[] = [
  { key: "sales", label: "تقرير المبيعات" },
  { key: "purchases", label: "تقرير المشتريات" },
  { key: "expenses", label: "تقرير المصروفات" },
  { key: "stock", label: "تقرير المخزون (حسب المخزن)" },
  { key: "debts", label: "أرصدة التجار والموردين" },
  { key: "batches", label: "التشغيلات وتواريخ الصلاحية" },
  { key: "monthly", label: "الإيرادات والمصروفات شهرياً" },
];

export function buildReport(key: ReportKey, db: DB, period: Period): Report {
  const wname = (id?: string) => [MAIN_WAREHOUSE, ...db.warehouses].find((w) => w.id === (id ?? ""))?.name ?? "—";
  const items = (it: { productId: string; qty: number }[]) => it.map((i) => `${nameOf(db.products, i.productId)} ×${i.qty}`).join("، ");

  switch (key) {
    case "sales": {
      const rows = db.sales.filter((s) => inPeriod(s.date, period)).sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => [s.date, nameOf(db.traders, s.traderId), s.gov, wname(s.warehouseId), items(s.items), saleTotal(s), s.paid, saleDue(s)]);
      return { title: "تقرير المبيعات", headers: ["التاريخ", "التاجر", "المحافظة", "المخزن", "الأصناف", "الإجمالي", "المدفوع", "المتبقي"], rows };
    }
    case "purchases": {
      const rows = db.purchases.filter((s) => inPeriod(s.date, period)).sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => [s.date, nameOf(db.suppliers, s.supplierId), wname(s.warehouseId), items(s.items), purchaseTotal(s), s.paid, purchaseDue(s)]);
      return { title: "تقرير المشتريات", headers: ["التاريخ", "المورد", "المخزن", "الأصناف", "الإجمالي", "المدفوع", "المتبقي"], rows };
    }
    case "expenses": {
      const rows = db.expenses.filter((s) => inPeriod(s.date, period)).sort((a, b) => b.date.localeCompare(a.date))
        .map((e) => [e.date, e.category, e.gov || "—", e.amount, e.note]);
      return { title: "تقرير المصروفات", headers: ["التاريخ", "النوع", "المحافظة", "المبلغ", "ملاحظة"], rows };
    }
    case "stock": {
      const whs = [MAIN_WAREHOUSE, ...db.warehouses];
      const rows = db.products.map((p) => [
        p.name, p.unit, ...whs.map((w) => stockInWarehouse(db, p.id, w.id)), stockOf(db, p.id), avgCost(db, p.id),
        Math.max(0, stockOf(db, p.id)) * avgCost(db, p.id),
      ]);
      return { title: "تقرير المخزون", headers: ["الصنف", "الوحدة", ...whs.map((w) => w.name), "الإجمالي", "متوسط التكلفة", "القيمة"], rows };
    }
    case "debts": {
      const rows: (string | number)[][] = [
        ...db.traders.map((t) => ["تاجر", t.name, t.gov, traderDebt(db, t.id)]),
        ...db.suppliers.map((t) => ["مورد", t.name, t.gov, supplierDebt(db, t.id)]),
      ];
      return { title: "أرصدة التجار والموردين", headers: ["النوع", "الاسم", "المحافظة", "الرصيد المتبقي"], rows };
    }
    case "batches": {
      const rows = batchesRemaining(db).filter((b) => b.remaining > 0)
        .sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"))
        .map((b) => [nameOf(db.products, b.productId), b.date, b.expiry ?? "بدون صلاحية", b.received, b.remaining]);
      return { title: "التشغيلات وتواريخ الصلاحية", headers: ["الصنف", "تاريخ الشراء", "الصلاحية", "الكمية المستلمة", "المتبقي"], rows };
    }
    case "monthly": {
      const rows = monthlySeries(db).map(([m, v]) => [m, v.revenue, v.spending, v.revenue - v.spending]);
      rows.push(["الإجمالي", sum(rows, (r) => +r[1]), sum(rows, (r) => +r[2]), sum(rows, (r) => +r[3])]);
      return { title: "الإيرادات والمصروفات شهرياً", headers: ["الشهر", "الإيرادات", "المشتريات + المصروفات", "الفرق"], rows };
    }
  }
}

/** تصدير CSV بترميز UTF-8 مع BOM ليفتح في Excel بالعربي صح. */
export function downloadCsv(r: Report) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [r.headers, ...r.rows].map((row) => row.map(esc).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${r.title}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

/** طباعة / حفظ PDF من نافذة الطباعة. */
export function printReport(r: Report) {
  const fm = (v: string | number) => (typeof v === "number" ? fmt(v) : v);
  openPrint(r.title, `<h1>🌿 ${r.title}</h1><div class="meta">${new Date().toLocaleDateString("ar-EG")}</div>
    <table><tr>${r.headers.map((h) => `<th>${h}</th>`).join("")}</tr>
    ${r.rows.map((row) => `<tr>${row.map((c) => `<td>${fm(c)}</td>`).join("")}</tr>`).join("")}</table>`);
}
