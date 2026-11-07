import { useCallback, useEffect, useState } from "react";
import type { Collection, DB } from "./types";
import { uid } from "./calc";

const KEY = "pesticide_app_v2";
const LEGACY_KEY = "pesticide_app_v1";

const empty: DB = {
  traders: [], suppliers: [], products: [], sales: [],
  purchases: [], expenses: [], payments: [],
};

/** يحوّل الفواتير القديمة (صنف واحد) إلى الشكل الجديد (items). */
function migrate(raw: any): DB {
  const d = { ...empty, ...raw };
  d.sales = d.sales.map((s: any) =>
    s.items ? s : { id: s.id, date: s.date, traderId: s.traderId, gov: s.gov, paid: s.paid,
      items: [{ productId: s.productId, qty: s.qty, price: s.price }] });
  d.purchases = d.purchases.map((p: any) =>
    p.items ? p : { id: p.id, date: p.date, supplierId: p.supplierId, paid: p.paid,
      items: [{ productId: p.productId, qty: p.qty, cost: p.cost }] });
  return d;
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    return raw ? migrate(JSON.parse(raw)) : empty;
  } catch {
    return empty;
  }
}

export function useDB() {
  const [db, setDb] = useState<DB>(load);

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(db)), [db]);

  const add = useCallback(<K extends Collection>(c: K, item: Omit<DB[K][number], "id">) => {
    setDb((d) => ({ ...d, [c]: [...d[c], { ...item, id: uid() }] }));
  }, []);

  const update = useCallback((c: Collection, id: string, item: object) => {
    setDb((d) => ({
      ...d,
      [c]: (d[c] as { id: string }[]).map((x) => (x.id === id ? { ...item, id } : x)),
    }));
  }, []);

  const remove = useCallback((c: Collection, id: string) => {
    setDb((d) => ({ ...d, [c]: (d[c] as { id: string }[]).filter((x) => x.id !== id) }));
  }, []);

  const replaceAll = useCallback((next: DB) => setDb(migrate(next)), []);

  return { db, add, update, remove, replaceAll };
}

export type Store = ReturnType<typeof useDB>;
