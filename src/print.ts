import { fmt, nameOf, purchaseDue, purchaseTotal, saleDue, saleTotal } from "./calc";
import type { DB, Party, Sale } from "./types";

const STYLE = `
body{font-family:Tahoma,Arial,sans-serif;padding:30px;color:#111}
h1{margin:0;color:#14532d} .meta{color:#555;margin:4px 0 18px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid #ccc;padding:7px;text-align:right}
th{background:#e7f6ec} .tot td{font-weight:bold;background:#f6f6f6}
.big{font-size:18px;margin-top:16px}
`;

export function openPrint(title: string, body: string) {
  const w = window.open("", "_blank");
  if (!w) return alert("اسمح بالنوافذ المنبثقة للطباعة");
  w.document.write(`<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style></head><body>${body}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

export function printInvoice(sale: Sale, db: DB) {
  const rows = sale.items.map((i) =>
    `<tr><td>${nameOf(db.products, i.productId)}</td><td>${fmt(i.qty)}</td><td>${fmt(i.price)}</td><td>${fmt(i.qty * i.price)}</td></tr>`).join("");
  openPrint("فاتورة بيع", `
    <h1>🌿 فاتورة بيع</h1>
    <div class="meta">التاريخ: ${sale.date} | التاجر: <b>${nameOf(db.traders, sale.traderId)}</b> | المحافظة: ${sale.gov}</div>
    <table><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>${rows}
    <tr class="tot"><td colspan="3">الإجمالي</td><td>${fmt(saleTotal(sale))}</td></tr>
    <tr><td colspan="3">المدفوع</td><td>${fmt(sale.paid)}</td></tr>
    <tr class="tot"><td colspan="3">المتبقي</td><td>${fmt(saleDue(sale))}</td></tr></table>
    ${sale.note ? `<p>ملاحظة: ${sale.note}</p>` : ""}`);
}

/** كشف حساب تاجر أو مورد: الفواتير والدفعات بالترتيب مع رصيد متحرك. */
export function printStatement(party: Party, kind: "traders" | "suppliers", db: DB) {
  const isTrader = kind === "traders";
  type Row = { date: string; text: string; debit: number; credit: number };
  const rows: Row[] = [];
  if (isTrader) {
    db.sales.filter((s) => s.traderId === party.id).forEach((s) => {
      rows.push({ date: s.date, text: "فاتورة بيع", debit: saleTotal(s), credit: s.paid });
    });
  } else {
    db.purchases.filter((s) => s.supplierId === party.id).forEach((s) => {
      rows.push({ date: s.date, text: "فاتورة شراء", debit: purchaseTotal(s), credit: s.paid });
    });
  }
  db.payments.filter((p) => p.partyId === party.id)
    .forEach((p) => rows.push({ date: p.date, text: "دفعة", debit: 0, credit: p.amount }));
  rows.sort((a, b) => a.date.localeCompare(b.date));

  let bal = 0;
  const body = rows.map((r) => {
    bal += r.debit - r.credit;
    return `<tr><td>${r.date}</td><td>${r.text}</td><td>${fmt(r.debit)}</td><td>${fmt(r.credit)}</td><td>${fmt(bal)}</td></tr>`;
  }).join("");
  openPrint("كشف حساب", `
    <h1>كشف حساب ${isTrader ? "تاجر" : "مورد"}: ${party.name}</h1>
    <div class="meta">${party.gov} ${party.phone ? "| " + party.phone : ""}</div>
    <table><tr><th>التاريخ</th><th>البيان</th><th>${isTrader ? "عليه" : "علينا"}</th><th>مدفوع</th><th>الرصيد</th></tr>${body}</table>
    <div class="big">الرصيد المتبقي: <b>${fmt(bal)} ج</b></div>`);
}
