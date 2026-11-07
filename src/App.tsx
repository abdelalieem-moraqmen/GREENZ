import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Sidebar } from "./components/ui";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./pages/Dashboard";
import { ExpensesPage, PartiesPage, ProductsPage, PurchasesPage, SalesPage } from "./pages/Pages";
import { readLocalData, useDB } from "./store";
import { supabase } from "./supabase";
import type { DB, PageKey } from "./types";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="splash">🌿</div>;
  if (!session) return <AuthScreen />;
  return <Main email={session.user.email ?? ""} />;
}

function Main({ email }: { email: string }) {
  const store = useDB();
  const [page, setPage] = useState<PageKey>("dash");

  // عرض نقل بيانات المتصفح القديمة مرة واحدة لو الحساب فاضي
  useEffect(() => {
    if (store.loading) return;
    const local = readLocalData();
    const cloudEmpty = Object.values(store.db).every((a) => a.length === 0);
    if (local && cloudEmpty && confirm("لقينا بيانات قديمة على المتصفح ده. ترفعها لحسابك على Supabase؟")) {
      store.importAll(local).then(() => {
        localStorage.removeItem("pesticide_app_v1");
        localStorage.removeItem("pesticide_app_v2");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.loading]);

  const exportData = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store.db)], { type: "application/json" }));
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importData = async (f: File) => store.importAll(JSON.parse(await f.text()) as DB);

  return (
    <div className="layout">
      <Sidebar page={page} onChange={setPage} onExport={exportData} onImport={importData}
        email={email} onLogout={() => supabase.auth.signOut()} />
      <main className="content">
        {store.loading ? <div className="splash">جاري التحميل…</div> : (
          <>
            {page === "dash" && <Dashboard db={store.db} />}
            {page === "sales" && <SalesPage store={store} />}
            {page === "purchases" && <PurchasesPage store={store} />}
            {page === "expenses" && <ExpensesPage store={store} />}
            {page === "traders" && <PartiesPage store={store} kind="traders" />}
            {page === "suppliers" && <PartiesPage store={store} kind="suppliers" />}
            {page === "products" && <ProductsPage store={store} />}
          </>
        )}
      </main>
    </div>
  );
}
