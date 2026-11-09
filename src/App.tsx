import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Sidebar } from "./components/ui";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./pages/Dashboard";
import { ExpensesPage, PartiesPage, ProductsPage, PurchasesPage, SalesPage } from "./pages/Pages";
import { ReportsPage, ReturnsPage, UsersPage, WarehousesPage } from "./pages/ErpPages";
import { readLocalData, useDB } from "./store";
import { supabase } from "./supabase";
import { ROLE_LABELS, ROLE_PAGES } from "./constants";
import type { DB, PageKey, Role } from "./types";

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
  return <RoleGate session={session} />;
}

/** يجيب دور المستخدم؛ لو لسه pending يعرض شاشة انتظار. */
function RoleGate({ session }: { session: Session }) {
  const [role, setRole] = useState<Role | null>(null);
  const [legacy, setLegacy] = useState(false); // schema_v2 لم يُشغَّل بعد

  useEffect(() => {
    supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle().then(({ data, error }) => {
      if (error) { setLegacy(true); setRole("admin"); } else setRole((data?.role as Role) ?? "pending");
    });
  }, [session.user.id]);

  if (!role) return <div className="splash">🌿</div>;
  if (role === "pending")
    return (
      <div className="auth-wrap"><div className="auth-card">
        <div className="auth-logo">⏳</div>
        <h1>بانتظار الموافقة</h1>
        <p>حسابك ({session.user.email}) اتسجّل. المدير لازم يحدد دورك الأول.</p>
        <button className="btn primary" onClick={() => location.reload()}>تحديث</button>
        <button className="link" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
      </div></div>
    );
  return <Main session={session} role={role} legacy={legacy} />;
}

function Main({ session, role, legacy }: { session: Session; role: Role; legacy: boolean }) {
  const store = useDB();
  const pages = ROLE_PAGES[role];
  const [page, setPage] = useState<PageKey>(pages[0]);

  // عرض نقل بيانات المتصفح القديمة مرة واحدة لو الحساب فاضي
  useEffect(() => {
    if (store.loading || role !== "admin") return;
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
        pages={pages} roleLabel={ROLE_LABELS[role]}
        email={session.user.email ?? ""} onLogout={() => supabase.auth.signOut()} />
      <main className="content">
        {legacy && <div className="alert red">⚠️ ميزات ERP (الصلاحيات والمخازن والمرتجعات) محتاجة تشغيل <b>supabase/schema_v2.sql</b> في SQL Editor.</div>}
        {store.loading ? <div className="splash">جاري التحميل…</div> : (
          <>
            {page === "dash" && <Dashboard db={store.db} />}
            {page === "sales" && <SalesPage store={store} />}
            {page === "purchases" && <PurchasesPage store={store} />}
            {page === "returns" && <ReturnsPage store={store} />}
            {page === "expenses" && <ExpensesPage store={store} />}
            {page === "traders" && <PartiesPage store={store} kind="traders" />}
            {page === "suppliers" && <PartiesPage store={store} kind="suppliers" />}
            {page === "products" && <ProductsPage store={store} />}
            {page === "warehouses" && <WarehousesPage store={store} />}
            {page === "reports" && <ReportsPage store={store} />}
            {page === "users" && <UsersPage myId={session.user.id} />}
          </>
        )}
      </main>
    </div>
  );
}
