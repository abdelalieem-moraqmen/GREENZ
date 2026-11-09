import { useState } from "react";
import { DataTable, PageHeader, Panel, type Column } from "../components/ui";
import { SpreadsheetTools } from "../components/SpreadsheetTools";
import { ExpenseForm, PartyForm, ProductForm, PurchaseForm, SaleForm } from "../components/forms";
import {
  avgCost, fmt, nameOf, purchaseDue, purchaseTotal, saleDue, saleTotal, stockOf, supplierDebt, today, traderDebt,
} from "../calc";
import { printInvoice, printStatement } from "../print";
import type { Store } from "../store";
import type { Collection, Expense, Party, Payment, Product, Purchase, Sale } from "../types";

const byDateDesc = <T extends { date: string }>(a: T[]) => [...a].sort((x, y) => y.date.localeCompare(x.date));
const Need = ({ text }: { text: string }) => <Panel><p className="empty">{text}</p></Panel>;

/** يدير حالة "إضافة / تعديل" لأي مجموعة بيانات. */
function useEditor<T extends { id: string }>(store: Store, c: Collection, rows: T[]) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = rows.find((r) => r.id === editingId);
  return {
    editing,
    key: editingId ?? "new",
    canCreate: store.can(c, "create"),
    canUpdate: store.can(c, "update"),
    canDelete: store.can(c, "delete"),
    startEdit: (r: T) => { setEditingId(r.id); window.scrollTo({ top: 0, behavior: "smooth" }); },
    cancel: () => setEditingId(null),
    save: (data: object) => {
      if (editingId) store.update(c, editingId, data);
      else store.add(c, data as never);
      setEditingId(null);
    },
  };
}

const EditBanner = ({ on }: { on: boolean }) => on ? <div className="editing-banner">✏️ أنت تعدّل سجلاً موجوداً</div> : null;

export function SalesPage({ store }: { store: Store }) {
  const { db, remove } = store;
  const ed = useEditor<Sale>(store, "sales", db.sales);
  if (!db.traders.length || !db.products.length)
    return <><PageHeader title="المبيعات" /><Need text="أضف تاجراً وصنفاً أولاً من تبويب التجار والمخزون." /></>;
  const cols: Column<Sale>[] = [
    { header: "التاريخ", cell: (r) => r.date },
    { header: "التاجر", cell: (r) => nameOf(db.traders, r.traderId) },
    { header: "المحافظة", cell: (r) => r.gov },
    { header: "الأصناف", cell: (r) => r.items.map((i) => `${nameOf(db.products, i.productId)} ×${fmt(i.qty)}`).join("، ") },
    { header: "الإجمالي", cell: (r) => <b>{fmt(saleTotal(r))}</b> },
    { header: "المدفوع", cell: (r) => fmt(r.paid) },
    { header: "المتبقي", cell: (r) => <span className="badge orange">{fmt(saleDue(r))}</span> },
  ];
  return (
    <>
      <PageHeader title="المبيعات" subtitle="فواتير البيع للتجار في المحافظات">
        <SpreadsheetTools store={store} collections={["sales"]} />
      </PageHeader>
      {(ed.editing ? ed.canUpdate : ed.canCreate) && <Panel title={ed.editing ? "تعديل فاتورة بيع" : "فاتورة بيع جديدة"}>
        <EditBanner on={!!ed.editing} />
        <SaleForm key={ed.key} db={db} initial={ed.editing} onSave={ed.save} onCancel={ed.cancel} />
      </Panel>}
      <Panel>
        <DataTable columns={cols} rows={byDateDesc(db.sales)} onEdit={ed.canUpdate ? ed.startEdit : undefined}
          onDelete={ed.canDelete ? (id) => remove("sales", id) : undefined}
          extraActions={(r) => <button className="btn sm print" onClick={() => printInvoice(r, db)}>🖨 طباعة</button>} />
      </Panel>
    </>
  );
}

export function PurchasesPage({ store }: { store: Store }) {
  const { db, remove } = store;
  const ed = useEditor<Purchase>(store, "purchases", db.purchases);
  if (!db.suppliers.length || !db.products.length)
    return <><PageHeader title="المشتريات" /><Need text="أضف مورداً وصنفاً أولاً." /></>;
  const cols: Column<Purchase>[] = [
    { header: "التاريخ", cell: (r) => r.date },
    { header: "المورد", cell: (r) => nameOf(db.suppliers, r.supplierId) },
    { header: "الأصناف", cell: (r) => r.items.map((i) => `${nameOf(db.products, i.productId)} ×${fmt(i.qty)}`).join("، ") },
    { header: "الإجمالي", cell: (r) => <b>{fmt(purchaseTotal(r))}</b> },
    { header: "المدفوع", cell: (r) => fmt(r.paid) },
    { header: "المتبقي", cell: (r) => <span className="badge orange">{fmt(purchaseDue(r))}</span> },
  ];
  return (
    <>
      <PageHeader title="المشتريات" subtitle="فواتير الشراء من الموردين (مع تاريخ الصلاحية لكل صنف)">
        <SpreadsheetTools store={store} collections={["purchases"]} />
      </PageHeader>
      {(ed.editing ? ed.canUpdate : ed.canCreate) && <Panel title={ed.editing ? "تعديل فاتورة شراء" : "فاتورة شراء جديدة"}>
        <EditBanner on={!!ed.editing} />
        <PurchaseForm key={ed.key} db={db} initial={ed.editing} onSave={ed.save} onCancel={ed.cancel} />
      </Panel>}
      <Panel><DataTable columns={cols} rows={byDateDesc(db.purchases)} onEdit={ed.canUpdate ? ed.startEdit : undefined} onDelete={ed.canDelete ? (id) => remove("purchases", id) : undefined} /></Panel>
    </>
  );
}

export function ExpensesPage({ store }: { store: Store }) {
  const { db, remove } = store;
  const ed = useEditor<Expense>(store, "expenses", db.expenses);
  const cols: Column<Expense>[] = [
    { header: "التاريخ", cell: (r) => r.date },
    { header: "النوع", cell: (r) => <span className="badge">{r.category}</span> },
    { header: "المحافظة", cell: (r) => r.gov || "—" },
    { header: "المبلغ", cell: (r) => <b>{fmt(r.amount)}</b> },
    { header: "ملاحظة", cell: (r) => r.note },
  ];
  return (
    <>
      <PageHeader title="المصروفات" subtitle="بنزين، سائق، صيانة، إيجار وغيره">
        <SpreadsheetTools store={store} collections={["expenses"]} />
      </PageHeader>
      {(ed.editing ? ed.canUpdate : ed.canCreate) && <Panel title={ed.editing ? "تعديل مصروف" : "تسجيل مصروف"}>
        <EditBanner on={!!ed.editing} />
        <ExpenseForm key={ed.key} initial={ed.editing} onSave={ed.save} onCancel={ed.cancel} />
      </Panel>}
      <Panel><DataTable columns={cols} rows={byDateDesc(db.expenses)} onEdit={ed.canUpdate ? ed.startEdit : undefined} onDelete={ed.canDelete ? (id) => remove("expenses", id) : undefined} /></Panel>
    </>
  );
}

export function PartiesPage({ store, kind }: { store: Store; kind: "traders" | "suppliers" }) {
  const { db, add, remove } = store;
  const ed = useEditor<Party>(store, kind, db[kind]);
  const isTrader = kind === "traders";
  const label = isTrader ? "تاجر" : "مورد";
  const type: Payment["type"] = isTrader ? "trader" : "supplier";
  const debt = (id: string) => (isTrader ? traderDebt(db, id) : supplierDebt(db, id));

  const pay = (id: string) => {
    const rawAmount = prompt("المبلغ:");
    if (rawAmount === null) return;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return alert("أدخل مبلغاً أكبر من صفر.");
    add("payments", { date: today(), type, partyId: id, amount });
  };
  const editPayment = (payment: Payment) => {
    const rawAmount = prompt("المبلغ الجديد:", String(payment.amount));
    if (rawAmount === null) return;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return alert("أدخل مبلغاً أكبر من صفر.");
    store.update("payments", payment.id, { ...payment, amount });
  };

  const cols: Column<Party>[] = [
    { header: "الاسم", cell: (r) => <b>{r.name}</b> },
    { header: "التليفون", cell: (r) => r.phone },
    { header: "المحافظة", cell: (r) => r.gov },
    { header: "المتبقي", cell: (r) => <span className={"badge " + (debt(r.id) > 0.5 ? "orange" : "green")}>{fmt(debt(r.id))}</span> },
  ];
  const payCols: Column<Payment>[] = [
    { header: "التاريخ", cell: (r) => r.date },
    { header: "الاسم", cell: (r) => nameOf(db[kind], r.partyId) },
    { header: "المبلغ", cell: (r) => fmt(r.amount) },
  ];
  return (
    <>
      <PageHeader title={isTrader ? "التجار" : "الموردون"} subtitle={isTrader ? "عملاؤك في المحافظات" : "من بتشتري منهم"}>
        <SpreadsheetTools store={store} collections={[kind, "payments"]} />
      </PageHeader>
      {(ed.editing ? ed.canUpdate : ed.canCreate) && <Panel title={ed.editing ? `تعديل ${label}` : `إضافة ${label}`}>
        <EditBanner on={!!ed.editing} />
        <PartyForm key={ed.key} initial={ed.editing} onSave={ed.save} onCancel={ed.cancel} label={label} />
      </Panel>}
      <Panel>
        <DataTable columns={cols} rows={db[kind]} onEdit={ed.canUpdate ? ed.startEdit : undefined} onDelete={ed.canDelete ? (id) => remove(kind, id) : undefined}
          extraActions={(r) => (
            <>
              {store.can("payments", "create") && <button className="btn sm blue" onClick={() => pay(r.id)}>تسجيل دفعة</button>}
              <button className="btn sm print" onClick={() => printStatement(r, kind, db)}>📄 كشف حساب</button>
            </>
          )} />
      </Panel>
      <Panel title="سجل الدفعات">
        <DataTable columns={payCols} rows={byDateDesc(db.payments.filter((p) => p.type === type))}
          onEdit={store.can("payments", "update") ? editPayment : undefined}
          onDelete={store.can("payments", "delete") ? (id) => remove("payments", id) : undefined} />
      </Panel>
    </>
  );
}

export function ProductsPage({ store }: { store: Store }) {
  const { db, remove } = store;
  const ed = useEditor<Product>(store, "products", db.products);
  const cols: Column<Product>[] = [
    { header: "الصنف", cell: (r) => <b>{r.name}</b> },
    { header: "الوحدة", cell: (r) => r.unit },
    { header: "سعر البيع", cell: (r) => fmt(r.price) },
    { header: "متوسط التكلفة", cell: (r) => fmt(avgCost(db, r.id)) },
    { header: "المتاح", cell: (r) => <span className={"badge " + (stockOf(db, r.id) <= r.min ? "red" : "green")}>{fmt(stockOf(db, r.id))}</span> },
    { header: "قيمة المخزون", cell: (r) => fmt(Math.max(0, stockOf(db, r.id)) * avgCost(db, r.id)) },
  ];
  return (
    <>
      <PageHeader title="المخزون" subtitle="الأصناف والكميات المتاحة">
        <SpreadsheetTools store={store} collections={["products"]} />
      </PageHeader>
      {(ed.editing ? ed.canUpdate : ed.canCreate) && <Panel title={ed.editing ? "تعديل صنف" : "إضافة صنف"}>
        <EditBanner on={!!ed.editing} />
        <ProductForm key={ed.key} initial={ed.editing} onSave={ed.save} onCancel={ed.cancel} />
      </Panel>}
      <Panel><DataTable columns={cols} rows={db.products} onEdit={ed.canUpdate ? ed.startEdit : undefined} onDelete={ed.canDelete ? (id) => remove("products", id) : undefined} /></Panel>
    </>
  );
}
