import { useCallback, useEffect, useState } from "react";
import type { Collection, DB } from "./types";
import { uid } from "./calc";
import { supabase } from "./supabase";

export const TABLES: Collection[] = ["traders", "suppliers", "products", "sales", "purchases", "expenses", "payments"];

const empty: DB = {
  traders: [], suppliers: [], products: [], sales: [],
  purchases: [], expenses: [], payments: [],
};

/* camelCase (التطبيق) <-> snake_case (قاعدة البيانات) — المفاتيح العليا فقط */
const toSnake = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()), v]));
const toCamel = (o: Record<string, unknown>) => {
  const { user_id: _u, ...rest } = o;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
};

/** يحوّل الفواتير القديمة (صنف واحد) إلى الشكل الجديد (items). */
export function migrate(raw: any): DB {
  const d = { ...empty, ...raw };
  d.sales = d.sales.map((s: any) =>
    s.items ? s : { id: s.id, date: s.date, traderId: s.traderId, gov: s.gov, paid: s.paid,
      items: [{ productId: s.productId, qty: s.qty, price: s.price }] });
  d.purchases = d.purchases.map((p: any) =>
    p.items ? p : { id: p.id, date: p.date, supplierId: p.supplierId, paid: p.paid,
      items: [{ productId: p.productId, qty: p.qty, cost: p.cost }] });
  return d;
}

/** بيانات قديمة محفوظة في المتصفح (قبل Supabase). */
export function readLocalData(): DB | null {
  const raw = localStorage.getItem("pesticide_app_v2") ?? localStorage.getItem("pesticide_app_v1");
  if (!raw) return null;
  try {
    const d = migrate(JSON.parse(raw));
    return TABLES.some((t) => d[t].length) ? d : null;
  } catch {
    return null;
  }
}

export function useDB() {
  const [db, setDb] = useState<DB>(empty);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const results = await Promise.all(TABLES.map((t) => supabase.from(t).select("*")));
    const next: any = { ...empty };
    results.forEach((r, i) => {
      if (r.error) alert(`خطأ في تحميل ${TABLES[i]}: ${r.error.message}`);
      else next[TABLES[i]] = (r.data ?? []).map((row) => toCamel(row));
    });
    setDb(next);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /** تنفيذ عملية على السيرفر؛ عند الفشل نعيد التحميل لنرجع للحالة الصحيحة. */
  const run = useCallback(async (op: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await op;
    if (error) { alert("تعذر الحفظ: " + error.message); reload(); }
  }, [reload]);

  const add = useCallback(<K extends Collection>(c: K, item: Omit<DB[K][number], "id">) => {
    const row = { ...item, id: uid() };
    setDb((d) => ({ ...d, [c]: [...d[c], row] }));
    run(supabase.from(c).insert(toSnake(row)));
  }, [run]);

  const update = useCallback((c: Collection, id: string, item: object) => {
    const row = { ...item, id };
    setDb((d) => ({ ...d, [c]: (d[c] as { id: string }[]).map((x) => (x.id === id ? row : x)) }));
    const { id: _id, ...patch } = row;
    run(supabase.from(c).update(toSnake(patch)).eq("id", id));
  }, [run]);

  const remove = useCallback((c: Collection, id: string) => {
    setDb((d) => ({ ...d, [c]: (d[c] as { id: string }[]).filter((x) => x.id !== id) }));
    run(supabase.from(c).delete().eq("id", id));
  }, [run]);

  /** استيراد (نسخة احتياطية أو بيانات المتصفح القديمة) — يدمج ولا يمسح. */
  const importAll = useCallback(async (raw: DB) => {
    const data = migrate(raw);
    for (const t of TABLES) {
      if (!data[t].length) continue;
      const { error } = await supabase.from(t).upsert(data[t].map((r: any) => toSnake(r)));
      if (error) { alert(`فشل استيراد ${t}: ${error.message}`); break; }
    }
    await reload();
  }, [reload]);

  return { db, loading, add, update, remove, importAll };
}

export type Store = ReturnType<typeof useDB>;
