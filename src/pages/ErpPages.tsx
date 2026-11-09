import { useEffect, useState } from "react";
import { DataTable, Field, PageHeader, Panel, Select, type Column } from "../components/ui";
import { ReturnForm, TransferForm, WarehouseForm } from "../components/forms";
import { fmt, inPeriod, nameOf, purchaseTotal, saleTotal, stockInWarehouse } from "../calc";
import { MAIN_WAREHOUSE, ROLE_LABELS } from "../constants";
import { REPORT_LIST, buildReport, downloadCsv, printReport, type ReportKey } from "../reports";
import { supabase } from "../supabase";
import type { Store } from "../store";
import type { Period, Profile, PurchaseReturn, Role, SalesReturn, Transfer, Warehouse } from "../types";

const byDateDesc = <T extends { date: string }>(a: T[]) => [...a].sort((x, y) => y.date.localeCompare(x.date));
const EditBanner = ({ on }: { on: boolean }) => on ? <div className="editing-banner">✏️ أنت تعدّل سجلاً موجوداً</div> : null;

function useEditor<T extends { id: string }>(store: Store, c: Parameters<Store["add"]>[0], rows: T[]) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = rows.find((r) => r.id === editingId);
  return {
    editing, key: editingId ?? "new",
    startEdit: (r: T) => { setEditingId(r.id); window.scrollTo({ top: 0, behavior: "smooth" }); },
    cancel: () => setEditingId(null),
    save: (data: object) => {
      if (editingId) store.update(c, editingId, data); else store.add(c, data as never);
      setEditingId(null);
    },
  };
}

const wName = (store: Store, id?: string) =>
  [MAIN_WAREHOUSE, ...store.db.warehouses].find((w) => w.id === (id ?? ""))?.name ?? "—";
const itemsText = (store: Store, items: { productId: string; qty: number }[]) =>
  items.map((i) => `${nameOf(store.db.products, i.productId)} ×${fmt(i.qty)}`).join("، ");

/* ================= المرتجعات ================= */
export function ReturnsPage({ store }: { store: Store }) {
  const { db, remove } = store;
  const [kind, setKind] = useState<"sales" | "purchases">("sales");
  const sEd = useEditor<SalesReturn>(store, "salesReturns", db.salesReturns);
  const pEd = useEditor<PurchaseReturn>(store, "purchaseReturns", db.purchaseReturns);
  const isSales = kind === "sales";

  const tabs = (
    <div className="tabs">
      <button className={isSales ? "on" : ""} onClick={() => setKind("sales")}>↩️ مرتجع مبيعات (من تاجر)</button>
      <button className={!isSales ? "on" : ""} onClick={() => setKind("purchases")}>↪️ مرتجع مشتريات (لمورد)</button>
    </div>
  );
  if (!db.products.length || (isSales ? !db.traders.length : !db.suppliers.length))
    return <><PageHeader title="المرتجعات" />{tabs}<Panel><p className="empty">أضف أصنافاً و{isSales ? "تاجراً" : "مورداً"} أولاً.</p></Panel></>;

  const sCols: Column<SalesReturn>[] = [
    { header: "التاريخ", cell: (r) => r.date },
    { header: "التاجر", cell: (r) => nameOf(db.traders, r.traderId) },
    { header: "المخزن", cell: (r) => wName(store, r.warehouseId) },
    { header: "الأصناف", cell: (r) => itemsText(store, r.items) },
    { header: "القيمة", cell: (r) => <b>{fmt(saleTotal(r))}</b> },
    { header: "السبب", cell: (r) => r.note },
  ];
  const pCols: Column<PurchaseReturn>[] = [
    { header: "التاريخ", cell: (r) => r.date },
    { header: "المورد", cell: (r) => nameOf(db.suppliers, r.supplierId) },
    { header: "المخزن", cell: (r) => wName(store, r.warehouseId) },
    { header: "الأصناف", cell: (r) => itemsText(store, r.items) },
    { header: "القيمة", cell: (r) => <b>{fmt(purchaseTotal(r))}</b> },
    { header: "السبب", cell: (r) => r.note },
  ];

  return (
    <>
      <PageHeader title="المرتجعات" subtitle="المرتجع بيرجّع الكمية للمخزن (أو يخرجها) ويقلل المديونية تلقائياً" />
      {tabs}
      {isSales ? (
        <>
          <Panel title={sEd.editing ? "تعديل مرتجع مبيعات" : "مرتجع مبيعات جديد"}>
            <EditBanner on={!!sEd.editing} />
            <ReturnForm key={"s" + sEd.key} db={db} kind="sales" initial={sEd.editing} onSave={sEd.save} onCancel={sEd.cancel} />
          </Panel>
          <Panel><DataTable columns={sCols} rows={byDateDesc(db.salesReturns)} onEdit={sEd.startEdit} onDelete={(id) => remove("salesReturns", id)} /></Panel>
        </>
      ) : (
        <>
          <Panel title={pEd.editing ? "تعديل مرتجع مشتريات" : "مرتجع مشتريات جديد"}>
            <EditBanner on={!!pEd.editing} />
            <ReturnForm key={"p" + pEd.key} db={db} kind="purchases" initial={pEd.editing} onSave={pEd.save} onCancel={pEd.cancel} />
          </Panel>
          <Panel><DataTable columns={pCols} rows={byDateDesc(db.purchaseReturns)} onEdit={pEd.startEdit} onDelete={(id) => remove("purchaseReturns", id)} /></Panel>
        </>
      )}
    </>
  );
}

/* ================= المخازن والتحويلات ================= */
export function WarehousesPage({ store }: { store: Store }) {
  const { db, remove } = store;
  const wEd = useEditor<Warehouse>(store, "warehouses", db.warehouses);
  const tEd = useEditor<Transfer>(store, "transfers", db.transfers);
  const whs = [MAIN_WAREHOUSE, ...db.warehouses];

  const wCols: Column<Warehouse>[] = [
    { header: "المخزن", cell: (r) => <b>{r.name}</b> },
    { header: "المحافظة", cell: (r) => r.gov },
  ];
  const tCols: Column<Transfer>[] = [
    { header: "التاريخ", cell: (r) => r.date },
    { header: "من", cell: (r) => wName(store, r.fromId) },
    { header: "إلى", cell: (r) => wName(store, r.toId) },
    { header: "الأصناف", cell: (r) => itemsText(store, r.items) },
    { header: "ملاحظة", cell: (r) => r.note },
  ];

  return (
    <>
      <PageHeader title="المخازن والتحويلات" subtitle="المخزن الرئيسي + أي مخازن أو عربيات تضيفها" />
      <Panel title="الكميات في كل مخزن">
        {!db.products.length ? <p className="empty">أضف أصنافاً أولاً</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>الصنف</th>{whs.map((w) => <th key={w.id}>{w.name}</th>)}</tr></thead>
            <tbody>{db.products.map((p) => (
              <tr key={p.id}><td><b>{p.name}</b></td>
                {whs.map((w) => {
                  const q = stockInWarehouse(db, p.id, w.id);
                  return <td key={w.id}><span className={"badge " + (q < 0 ? "red" : q === 0 ? "" : "green")}>{fmt(q)}</span></td>;
                })}</tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>

      <Panel title={wEd.editing ? "تعديل مخزن" : "إضافة مخزن (أو عربية توزيع)"}>
        <EditBanner on={!!wEd.editing} />
        <WarehouseForm key={wEd.key} initial={wEd.editing} onSave={wEd.save} onCancel={wEd.cancel} />
      </Panel>
      <Panel><DataTable columns={wCols} rows={db.warehouses} onEdit={wEd.startEdit} onDelete={(id) => remove("warehouses", id)} /></Panel>

      {db.warehouses.length > 0 && db.products.length > 0 && (
        <>
          <Panel title={tEd.editing ? "تعديل تحويل" : "تحويل بين المخازن"}>
            <EditBanner on={!!tEd.editing} />
            <TransferForm key={tEd.key} db={db} initial={tEd.editing} onSave={tEd.save} onCancel={tEd.cancel} />
          </Panel>
          <Panel title="سجل التحويلات"><DataTable columns={tCols} rows={byDateDesc(db.transfers)} onEdit={tEd.startEdit} onDelete={(id) => remove("transfers", id)} /></Panel>
        </>
      )}
    </>
  );
}

/* ================= التقارير ================= */
export function ReportsPage({ store }: { store: Store }) {
  const [key, setKey] = useState<ReportKey>("sales");
  const [period, setPeriod] = useState<Period>("all");
  const report = buildReport(key, store.db, period);
  const usesPeriod = key === "sales" || key === "purchases" || key === "expenses";

  return (
    <>
      <PageHeader title="التقارير" subtitle="اعرضها، صدّرها Excel، أو اطبعها / احفظها PDF">
        <div className="filters">
          <Field label="التقرير">
            <Select name="rep" defaultValue={key} onChange={(v) => setKey(v as ReportKey)}
              options={REPORT_LIST.map((r) => ({ value: r.key, label: r.label }))} />
          </Field>
          {usesPeriod && (
            <Field label="الفترة">
              <Select name="per" defaultValue={period} onChange={(v) => setPeriod(v as Period)}
                options={[{ value: "all", label: "الكل" }, { value: "month", label: "هذا الشهر" }, { value: "year", label: "هذه السنة" }]} />
            </Field>
          )}
          <button className="btn primary" onClick={() => downloadCsv(report)}>⬇ Excel</button>
          <button className="btn print" onClick={() => printReport(report)}>🖨 PDF / طباعة</button>
        </div>
      </PageHeader>
      <Panel title={report.title}>
        <div className="table-wrap"><table>
          <thead><tr>{report.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {report.rows.length === 0 && <tr><td colSpan={report.headers.length} className="empty">لا توجد بيانات</td></tr>}
            {report.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{typeof c === "number" ? fmt(c) : c}</td>)}</tr>)}
          </tbody>
        </table></div>
      </Panel>
    </>
  );
}

/* ================= المستخدمون (للمدير) ================= */
export function UsersPage({ myId }: { myId: string }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("email");
    if (error) setErr(error.message); else setUsers(data as Profile[]);
  };
  useEffect(() => { load(); }, []);

  const change = async (id: string, patch: Partial<Profile>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) alert("تعذر الحفظ: " + error.message); else load();
  };

  return (
    <>
      <PageHeader title="المستخدمون والصلاحيات" subtitle="أي حساب جديد بيظهر هنا «بانتظار الموافقة» لحد ما تحدد دوره" />
      {err && <div className="alert red">{err} — تأكد إنك شغّلت schema_v2.sql</div>}
      <Panel>
        <div className="table-wrap"><table>
          <thead><tr><th>الإيميل</th><th>الاسم</th><th>الدور</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}{u.id === myId && " (أنت)"}</td>
              <td><input defaultValue={u.name} placeholder="اسم المستخدم"
                onBlur={(e) => e.target.value !== u.name && change(u.id, { name: e.target.value })} /></td>
              <td>
                <select value={u.role} disabled={u.id === myId} onChange={(e) => change(u.id, { role: e.target.value as Role })}>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="empty">
          المدير والمحاسب: كل الصفحات • مندوب المبيعات: المبيعات والمرتجعات والتجار • السائق: المبيعات والمصروفات
        </p>
      </Panel>
    </>
  );
}
