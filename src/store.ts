import { useCallback, useEffect, useState } from "react";
import type { Collection, DB } from "./types";
import { uid } from "./calc";
import { supabase } from "./supabase";
import { TABLE_NAMES } from "./constants";

export const TABLES = Object.keys(TABLE_NAMES) as Collection[];
const tbl = (c: Collection) => TABLE_NAMES[c];

const empty: DB = {
  traders: [], suppliers: [], products: [], warehouses: [], sales: [],
  purchases: [], salesReturns: [], purchaseReturns: [], transfers: [],
  expenses: [], payments: [],
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
  d.traders = d.traders.map((party: any) => ({ openingBalance: 0, ...party }));
  d.suppliers = d.suppliers.map((party: any) => ({ openingBalance: 0, ...party }));
  d.products = d.products.map((product: any) => ({ openingQty: 0, openingCost: 0, ...product }));
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

export function useDB(permissions: string[], superAdmin = false) {
  const [db, setDb] = useState<DB>(empty);
  const [loading, setLoading] = useState(true);
  const can = useCallback((c: Collection, action: "read" | "create" | "update" | "delete") =>
    superAdmin || permissions.includes(`${tbl(c)}.${action}`), [permissions, superAdmin]);

  const reload = useCallback(async () => {
    const readable = TABLES.filter((t) => can(t, "read"));
    const results = await Promise.all(readable.map((t) => supabase.from(tbl(t)).select("*")));
    const next: DB = { ...empty };
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.error) failed.push(readable[i]);
      else (next[readable[i]] as unknown[]) = (r.data ?? []).map((row) => toCamel(row));
    });
    if (failed.length) alert(`تعذر تحميل: ${failed.join("، ")}\nتحقق من صلاحيات الحساب وشغّل ترحيلات Supabase من schema.sql إلى schema_v7.sql.`);
    setDb(next);
    setLoading(false);
  }, [can, permissions]);

  useEffect(() => { reload(); }, [reload]);

  /** تنفيذ عملية على السيرفر؛ عند الفشل نعيد التحميل لنرجع للحالة الصحيحة. */
  const run = useCallback(async (op: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await op;
    if (error) { alert("تعذر الحفظ: " + error.message); reload(); }
  }, [reload]);

  const add = useCallback(<K extends Collection>(c: K, item: Omit<DB[K][number], "id">) => {
    if (!can(c, "create")) { alert("ليس لديك صلاحية إضافة هذا السجل."); return; }
    const row = { ...item, id: uid() };
    setDb((d) => ({ ...d, [c]: [...d[c], row] }));
    run(supabase.from(tbl(c)).insert(toSnake(row)));
  }, [can, run]);

  const update = useCallback((c: Collection, id: string, item: object) => {
    if (!can(c, "update")) { alert("ليس لديك صلاحية تعديل هذا السجل."); return; }
    const row = { ...item, id };
    setDb((d) => ({ ...d, [c]: (d[c] as { id: string }[]).map((x) => (x.id === id ? row : x)) }));
    const { id: _id, ...patch } = row;
    run(supabase.from(tbl(c)).update(toSnake(patch)).eq("id", id));
  }, [can, run]);

  const remove = useCallback((c: Collection, id: string) => {
    if (!can(c, "delete")) { alert("ليس لديك صلاحية حذف هذا السجل."); return; }
    setDb((d) => ({ ...d, [c]: (d[c] as { id: string }[]).filter((x) => x.id !== id) }));
    run(supabase.from(tbl(c)).delete().eq("id", id));
  }, [can, run]);

  /** استيراد (نسخة احتياطية أو بيانات المتصفح القديمة) — يدمج ولا يمسح. */
  const importAll = useCallback(async (raw: DB) => {
    if (!superAdmin) { alert("استيراد النسخ الاحتياطية متاح للسوبر أدمن فقط."); return; }
    const data = migrate(raw);
    for (const t of TABLES) {
      if (!data[t].length) continue;
      const { error } = await supabase.from(tbl(t)).upsert(data[t].map((r: any) => toSnake(r)));
      if (error) { alert(`فشل استيراد ${t}: ${error.message}`); break; }
    }
    await reload();
  }, [reload, superAdmin]);

  const importRows = useCallback(async (c: Collection, rows: Record<string, unknown>[]) => {
    if (!can(c, "read")) throw new Error(`ليس لديك صلاحية قراءة قسم ${c}.`);
    if (rows.length > 5000) throw new Error("لا يمكن استيراد أكثر من 5000 صف في المرة الواحدة.");
    const currentIds = new Set((db[c] as { id: string }[]).map((row) => row.id));
    let created = 0;
    let updated = 0;
    try {
      for (const [index, raw] of rows.entries()) {
        const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : uid();
        const exists = currentIds.has(id);
        const row = { ...raw, id };
        let result;
        if (exists) {
          if (!can(c, "update")) throw new Error(`لا تملك صلاحية تعديل الصف الموجود في السطر ${index + 2}.`);
          const current = (db[c] as { id: string }[]).find((item) => item.id === id);
          result = await supabase.from(tbl(c)).update(toSnake({ ...current, ...row })).eq("id", id);
          if (!result.error) updated += 1;
        } else {
          if (!can(c, "create")) throw new Error(`لا تملك صلاحية إضافة الصف الجديد في السطر ${index + 2}.`);
          result = await supabase.from(tbl(c)).insert(toSnake(row));
          if (!result.error) {
            created += 1;
            currentIds.add(id);
          }
        }
        if (result.error) throw new Error(`فشل استيراد الصف ${index + 2}: ${result.error.message}`);
      }
    } catch (error) {
      await reload();
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail} (تم حفظ ${created} جديد وتعديل ${updated} قبل الخطأ.)`);
    }
    await reload();
    return { created, updated };
  }, [can, db, reload]);

  return { db, loading, add, update, remove, importAll, importRows, can };
}

export type Store = ReturnType<typeof useDB>;
