import { useState, type FormEvent } from "react";
import { GOVS, EXPENSE_CATEGORIES, UNITS, MAIN_WAREHOUSE } from "../constants";
import { Field, Select } from "./ui";
import { fmt, stockInWarehouse, sum, today } from "../calc";
import type { DB, Expense, Party, Product, Purchase, PurchaseLine, PurchaseReturn, Sale, SaleLine, SalesReturn, Transfer, Warehouse } from "../types";

/** خصائص مشتركة لكل النماذج: قيمة ابتدائية (للتعديل) + حفظ + إلغاء. */
interface FormProps<T> {
  initial?: T;
  onSave: (data: Omit<T, "id">) => void;
  onCancel?: () => void;
}

const NUMERIC = new Set(["qty", "price", "cost", "paid", "amount", "min"]);
function readForm(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const out: Record<string, string | number> = {};
  new FormData(e.currentTarget).forEach((v, k) => (out[k] = NUMERIC.has(k) ? Number(v) || 0 : String(v)));
  return out;
}

const whOpts = (db: DB) => [MAIN_WAREHOUSE, ...db.warehouses].map((w) => ({ value: w.id, label: w.name }));
const opt = <T extends { id: string; name: string }>(a: T[]) => a.map((x) => ({ value: x.id, label: x.name }));

function Actions({ editing, onCancel, label }: { editing: boolean; onCancel?: () => void; label: string }) {
  return (
    <div className="form-actions">
      <button className="btn primary">{editing ? "💾 حفظ التعديل" : label}</button>
      {editing && <button type="button" className="btn muted" onClick={onCancel}>إلغاء</button>}
    </div>
  );
}

const DateField = ({ value }: { value?: string }) => (
  <Field label="التاريخ"><input type="date" name="date" defaultValue={value ?? today()} required /></Field>
);
const NumField = ({ label, name, value, required }: { label: string; name: string; value?: number; required?: boolean }) => (
  <Field label={label}><input type="number" step="any" name={name} required={required} defaultValue={value} /></Field>
);

/* ================= فاتورة (بيع / شراء) متعددة الأصناف ================= */
type Line = { productId: string; qty: number | ""; unitPrice: number | ""; expiry?: string };

function LinesEditor(props: {
  db: DB; lines: Line[]; priceLabel: string; withExpiry?: boolean; hidePrice?: boolean;
  onChange: (l: Line[]) => void; priceFor?: (pid: string) => number;
}) {
  const { db, lines, onChange } = props;
  const set = (i: number, patch: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="lines">
      {lines.map((l, i) => (
        <div className="line" key={i}>
          <select value={l.productId}
            onChange={(e) => set(i, { productId: e.target.value, unitPrice: props.priceFor?.(e.target.value) || l.unitPrice })}>
            {db.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
          <input type="number" step="any" placeholder="الكمية" value={l.qty}
            onChange={(e) => set(i, { qty: e.target.value === "" ? "" : Number(e.target.value) })} />
          {!props.hidePrice && (
            <input type="number" step="any" placeholder={props.priceLabel} value={l.unitPrice}
              onChange={(e) => set(i, { unitPrice: e.target.value === "" ? "" : Number(e.target.value) })} />
          )}
          {props.withExpiry && (
            <input type="date" title="تاريخ الصلاحية" value={l.expiry ?? ""}
              onChange={(e) => set(i, { expiry: e.target.value })} />
          )}
          {!props.hidePrice && <b className="line-total">{fmt((+l.qty || 0) * (+l.unitPrice || 0))}</b>}
          <button type="button" className="btn sm danger" disabled={lines.length === 1}
            onClick={() => onChange(lines.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn sm blue"
        onClick={() => onChange([...lines, { productId: db.products[0].id, qty: "", unitPrice: props.priceFor?.(db.products[0].id) || "" }])}>
        ＋ إضافة صنف
      </button>
    </div>
  );
}

export function SaleForm({ db, initial, onSave, onCancel }: FormProps<Sale> & { db: DB }) {
  const first = db.products[0];
  const [validationError, setValidationError] = useState("");
  const [lines, setLines] = useState<Line[]>(
    initial ? initial.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.price }))
            : [{ productId: first.id, qty: "", unitPrice: first.price || "" }]);
  const total = sum(lines, (l) => (+l.qty || 0) * (+l.unitPrice || 0));

  return (
    <form className="invoice-form" onChange={() => setValidationError("")} onSubmit={(e) => {
      const f = readForm(e);
      const activeLines = lines.filter((l) => l.qty !== "");
      if (activeLines.some((l) => !Number.isFinite(+l.qty) || +l.qty <= 0))
        return setValidationError("تأكد أن كمية كل صنف أكبر من صفر.");
      if (activeLines.some((l) => !Number.isFinite(+l.unitPrice) || +l.unitPrice < 0))
        return setValidationError("سعر البيع لا يمكن أن يكون سالباً.");
      const items: SaleLine[] = activeLines.map((l) => ({
        productId: l.productId, qty: +l.qty, price: +l.unitPrice,
      }));
      if (!items.length) return setValidationError("أضف صنفاً واحداً على الأقل بكمية صحيحة.");

      const paid = f.paid as number;
      if (!Number.isFinite(paid) || paid < 0 || paid > total)
        return setValidationError("المدفوع يجب أن يكون بين صفر وإجمالي الفاتورة.");

      const warehouseId = String(f.warehouseId ?? "");
      const requestedByProduct = new Map<string, number>();
      items.forEach((item) => requestedByProduct.set(
        item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.qty,
      ));
      for (const [productId, requested] of requestedByProduct) {
        const returnedByEdit = initial && (initial.warehouseId ?? "") === warehouseId
          ? sum(initial.items.filter((item) => item.productId === productId), (item) => item.qty)
          : 0;
        const available = stockInWarehouse(db, productId, warehouseId) + returnedByEdit;
        if (requested > available) {
          const productName = db.products.find((product) => product.id === productId)?.name ?? "الصنف";
          return setValidationError(
            `الكمية المطلوبة من "${productName}" (${fmt(requested)}) أكبر من المتاح في هذا المخزن (${fmt(Math.max(0, available))}).`,
          );
        }
      }

      onSave({ date: f.date as string, traderId: f.traderId as string, warehouseId, gov: f.gov as string, paid, note: f.note as string, items });
      if (!initial) setLines([{ productId: first.id, qty: "", unitPrice: first.price || "" }]);
    }}>
      <div className="form-grid">
        <DateField value={initial?.date} />
        <Field label="التاجر"><Select name="traderId" options={opt(db.traders)} defaultValue={initial?.traderId} /></Field>
        <Field label="المحافظة"><Select name="gov" options={GOVS} defaultValue={initial?.gov} /></Field>
        <Field label="المخزن"><Select name="warehouseId" options={whOpts(db)} defaultValue={initial?.warehouseId ?? ""} /></Field>
        <Field label="المدفوع الآن"><input type="number" step="any" min="0" max={total} name="paid" defaultValue={initial?.paid ?? 0} /></Field>
        <Field label="ملاحظة"><input name="note" defaultValue={initial?.note} /></Field>
      </div>
      <LinesEditor db={db} lines={lines} onChange={setLines} priceLabel="سعر الوحدة"
        priceFor={(pid) => db.products.find((p) => p.id === pid)?.price ?? 0} />
      <div className="invoice-total">إجمالي الفاتورة: <b>{fmt(total)} ج</b></div>
      {validationError && <div className="alert red" role="alert">{validationError}</div>}
      <Actions editing={!!initial} onCancel={onCancel} label="حفظ الفاتورة" />
    </form>
  );
}

export function PurchaseForm({ db, initial, onSave, onCancel }: FormProps<Purchase> & { db: DB }) {
  const first = db.products[0];
  const blank = (): Line[] => [{ productId: first.id, qty: "", unitPrice: "" }];
  const [lines, setLines] = useState<Line[]>(
    initial ? initial.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.cost, expiry: i.expiry })) : blank());
  const total = sum(lines, (l) => (+l.qty || 0) * (+l.unitPrice || 0));

  return (
    <form className="invoice-form" onSubmit={(e) => {
      const f = readForm(e);
      const items: PurchaseLine[] = lines.filter((l) => +l.qty > 0)
        .map((l) => ({ productId: l.productId, qty: +l.qty, cost: +l.unitPrice || 0, expiry: l.expiry || undefined }));
      if (!items.length) return alert("أضف صنفاً بكمية صحيحة");
      onSave({ date: f.date as string, supplierId: f.supplierId as string, warehouseId: f.warehouseId as string, paid: f.paid as number, note: f.note as string, items });
      if (!initial) setLines(blank());
    }}>
      <div className="form-grid">
        <DateField value={initial?.date} />
        <Field label="المورد"><Select name="supplierId" options={opt(db.suppliers)} defaultValue={initial?.supplierId} /></Field>
        <Field label="المخزن"><Select name="warehouseId" options={whOpts(db)} defaultValue={initial?.warehouseId ?? ""} /></Field>
        <NumField label="المدفوع الآن" name="paid" value={initial?.paid ?? 0} />
        <Field label="ملاحظة"><input name="note" defaultValue={initial?.note} /></Field>
      </div>
      <LinesEditor db={db} lines={lines} onChange={setLines} priceLabel="سعر الشراء" withExpiry />
      <div className="invoice-total">إجمالي الفاتورة: <b>{fmt(total)} ج</b></div>
      <Actions editing={!!initial} onCancel={onCancel} label="حفظ الفاتورة" />
    </form>
  );
}

/* ================= نماذج بسيطة ================= */
export function ExpenseForm({ initial, onSave, onCancel }: FormProps<Expense>) {
  return (
    <form className="form-grid" onSubmit={(e) => { onSave(readForm(e) as never); if (!initial) e.currentTarget.reset(); }}>
      <DateField value={initial?.date} />
      <Field label="النوع"><Select name="category" options={EXPENSE_CATEGORIES} defaultValue={initial?.category} /></Field>
      <Field label="المحافظة (اختياري)"><Select name="gov" options={GOVS} allowEmpty defaultValue={initial?.gov} /></Field>
      <NumField label="المبلغ" name="amount" value={initial?.amount} required />
      <Field label="ملاحظة"><input name="note" defaultValue={initial?.note} /></Field>
      <Actions editing={!!initial} onCancel={onCancel} label="حفظ المصروف" />
    </form>
  );
}

export function PartyForm({ initial, onSave, onCancel, label }: FormProps<Party> & { label: string }) {
  return (
    <form className="form-grid" onSubmit={(e) => { onSave(readForm(e) as never); if (!initial) e.currentTarget.reset(); }}>
      <Field label="الاسم"><input name="name" required defaultValue={initial?.name} /></Field>
      <Field label="التليفون"><input name="phone" defaultValue={initial?.phone} /></Field>
      <Field label="المحافظة"><Select name="gov" options={GOVS} defaultValue={initial?.gov} /></Field>
      <NumField label={`الرصيد الافتتاحي (مستحق ${label === "مورد" ? "للمورد" : "لنا"})`} name="openingBalance" value={initial?.openingBalance ?? 0} />
      <Actions editing={!!initial} onCancel={onCancel} label={`إضافة ${label}`} />
    </form>
  );
}

export function ProductForm({ initial, onSave, onCancel }: FormProps<Product>) {
  return (
    <form className="form-grid" onSubmit={(e) => { onSave(readForm(e) as never); if (!initial) e.currentTarget.reset(); }}>
      <Field label="اسم المبيد"><input name="name" required defaultValue={initial?.name} /></Field>
      <Field label="الوحدة"><Select name="unit" options={UNITS} defaultValue={initial?.unit} /></Field>
      <NumField label="سعر البيع الافتراضي" name="price" value={initial?.price} />
      <NumField label="حد التنبيه" name="min" value={initial?.min ?? 5} />
      <NumField label="رصيد أول المدة" name="openingQty" value={initial?.openingQty ?? 0} />
      <NumField label="تكلفة الوحدة أول المدة" name="openingCost" value={initial?.openingCost ?? 0} />
      <Actions editing={!!initial} onCancel={onCancel} label="إضافة صنف" />
    </form>
  );
}

/* ================= مرتجعات ================= */
/** مرتجع مبيعات (من تاجر) أو مرتجع مشتريات (إلى مورد) — نفس الشكل، الفرق في الطرف والسعر. */
export function ReturnForm(props: {
  db: DB; kind: "sales" | "purchases";
  initial?: SalesReturn | PurchaseReturn;
  onSave: (data: object) => void; onCancel?: () => void;
}) {
  const { db, kind, initial } = props;
  const isSales = kind === "sales";
  const first = db.products[0];
  const blank = (): Line[] => [{ productId: first.id, qty: "", unitPrice: isSales ? first.price || "" : "" }];
  const [lines, setLines] = useState<Line[]>(
    initial ? (initial.items as any[]).map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: isSales ? i.price : i.cost })) : blank());
  const total = sum(lines, (l) => (+l.qty || 0) * (+l.unitPrice || 0));
  const init = initial as any;

  return (
    <form className="invoice-form" onSubmit={(e) => {
      const f = readForm(e);
      const items = lines.filter((l) => +l.qty > 0).map((l) =>
        isSales ? { productId: l.productId, qty: +l.qty, price: +l.unitPrice || 0 }
                : { productId: l.productId, qty: +l.qty, cost: +l.unitPrice || 0 });
      if (!items.length) return alert("أضف صنفاً بكمية صحيحة");
      props.onSave({
        date: f.date, warehouseId: f.warehouseId, note: f.note, items,
        ...(isSales ? { traderId: f.partyId } : { supplierId: f.partyId }),
      });
      if (!initial) setLines(blank());
    }}>
      <div className="form-grid">
        <DateField value={initial?.date} />
        <Field label={isSales ? "التاجر" : "المورد"}>
          <Select name="partyId" options={opt(isSales ? db.traders : db.suppliers)}
            defaultValue={isSales ? init?.traderId : init?.supplierId} />
        </Field>
        <Field label="المخزن"><Select name="warehouseId" options={whOpts(db)} defaultValue={initial?.warehouseId ?? ""} /></Field>
        <Field label="ملاحظة / سبب المرتجع"><input name="note" defaultValue={initial?.note} /></Field>
      </div>
      <LinesEditor db={db} lines={lines} onChange={setLines} priceLabel={isSales ? "سعر الوحدة" : "سعر الشراء"}
        priceFor={isSales ? (pid) => db.products.find((p) => p.id === pid)?.price ?? 0 : undefined} />
      <div className="invoice-total">قيمة المرتجع: <b>{fmt(total)} ج</b></div>
      <Actions editing={!!initial} onCancel={props.onCancel} label="حفظ المرتجع" />
    </form>
  );
}

/* ================= مخازن وتحويلات ================= */
export function WarehouseForm({ initial, onSave, onCancel }: FormProps<Warehouse>) {
  return (
    <form className="form-grid" onSubmit={(e) => { onSave(readForm(e) as never); if (!initial) e.currentTarget.reset(); }}>
      <Field label="اسم المخزن"><input name="name" required defaultValue={initial?.name} /></Field>
      <Field label="المحافظة"><Select name="gov" options={GOVS} defaultValue={initial?.gov} /></Field>
      <Actions editing={!!initial} onCancel={onCancel} label="إضافة مخزن" />
    </form>
  );
}

export function TransferForm({ db, initial, onSave, onCancel }: FormProps<Transfer> & { db: DB }) {
  const first = db.products[0];
  const blank = (): Line[] => [{ productId: first.id, qty: "", unitPrice: 0 }];
  const [lines, setLines] = useState<Line[]>(
    initial ? initial.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: 0 })) : blank());
  const wh = whOpts(db);
  return (
    <form className="invoice-form" onSubmit={(e) => {
      const f = readForm(e);
      if (f.fromId === f.toId) return alert("اختر مخزنين مختلفين");
      const items = lines.filter((l) => +l.qty > 0).map((l) => ({ productId: l.productId, qty: +l.qty }));
      if (!items.length) return alert("أضف صنفاً بكمية صحيحة");
      onSave({ date: f.date as string, fromId: f.fromId as string, toId: f.toId as string, note: f.note as string, items });
      if (!initial) setLines(blank());
    }}>
      <div className="form-grid">
        <DateField value={initial?.date} />
        <Field label="من مخزن"><Select name="fromId" options={wh} defaultValue={initial?.fromId ?? ""} /></Field>
        <Field label="إلى مخزن"><Select name="toId" options={wh} defaultValue={initial?.toId ?? wh[1]?.value ?? ""} /></Field>
        <Field label="ملاحظة"><input name="note" defaultValue={initial?.note} /></Field>
      </div>
      <LinesEditor db={db} lines={lines} onChange={setLines} priceLabel="" hidePrice />
      <Actions editing={!!initial} onCancel={onCancel} label="تنفيذ التحويل" />
    </form>
  );
}