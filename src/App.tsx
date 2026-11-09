import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Sidebar } from "./components/ui";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./pages/Dashboard";
import { ExpensesPage, PartiesPage, ProductsPage, PurchasesPage, SalesPage } from "./pages/Pages";
import { ReportsPage, ReturnsPage, WarehousesPage } from "./pages/ErpPages";
import { ContentManagement, ContentPageView } from "./pages/ContentManagement";
import { RoleManagementPage } from "./pages/RoleManagement";
import { LandingPage } from "./pages/LandingPage";
import { readLocalData, useDB } from "./store";
import { supabase } from "./supabase";
import { pagesForRole, ROLE_LABELS } from "./constants";
import { DEFAULT_COMPANY_SETTINGS, deleteContentPage, loadSiteContent, saveCompanySettings, saveContentPage, uploadCompanyImage } from "./siteContent";
import type { CompanySettings, ContentPage, DB, PageKey, Role } from "./types";

export default function App() {
  const isErpRoute = window.location.pathname === "/erp" || window.location.pathname.startsWith("/erp/");
  return isErpRoute ? <ErpApp /> : <LandingPage />;
}

function ErpApp() {
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
  const [roleError, setRoleError] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    const loadRole = async () => {
      const { data, error } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      if (error) { setRoleError(error.message); return; }
      const userRole = (data?.role as Role) ?? "pending";
      if (userRole !== "pending" && userRole !== "superadmin") {
        const result = await supabase.from("role_permissions").select("permission_key").eq("role_key", userRole);
        if (result.error) { setRoleError(result.error.message); return; }
        setPermissions((result.data ?? []).map((item) => item.permission_key));
      }
      setRole(userRole);
    };
    void loadRole();
  }, [session.user.id]);

  if (roleError)
    return (
      <div className="auth-wrap"><div className="auth-card">
        <img className="auth-logo" src="/logo.png" alt="شعار الشركة" />
        <h1>تعذر التحقق من الصلاحيات</h1>
        <p>شغّل ملفات إعداد Supabase بالترتيب، ثم حدّث الصفحة.</p>
        <div className="alert red">{roleError}</div>
        <button className="btn primary" onClick={() => location.reload()}>إعادة المحاولة</button>
        <button className="link" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
      </div></div>
    );
  if (!role) return <div className="splash">🌿</div>;
  if (role === "pending")
    return (
      <div className="auth-wrap"><div className="auth-card">
        <div className="auth-status-icon">⏳</div>
        <h1>بانتظار الموافقة</h1>
        <p>حسابك ({session.user.email}) اتسجّل. السوبر أدمن لازم يحدد دورك الأول.</p>
        <button className="btn primary" onClick={() => location.reload()}>تحديث</button>
        <button className="link" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
      </div></div>
    );
  return <Main session={session} role={role} permissions={permissions} />;
}

function Main({ session, role, permissions }: { session: Session; role: Role; permissions: string[] }) {
  const isSuperAdmin = role === "superadmin";
  const store = useDB(permissions, isSuperAdmin);
  const pages = pagesForRole(role, permissions);
  const [page, setPage] = useState<PageKey>(pages[0] ?? "dash");
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [contentPages, setContentPages] = useState<ContentPage[]>([]);
  const [contentError, setContentError] = useState("");
  const [contentLoading, setContentLoading] = useState(true);

  useEffect(() => {
    loadSiteContent().then(({ settings, pages: loadedPages }) => {
      setCompanySettings(settings);
      setContentPages(loadedPages);
    }).catch((error: unknown) => {
      setContentError(error instanceof Error ? error.message : String(error));
    }).finally(() => setContentLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--green", companySettings.primaryColor);
    document.title = companySettings.brandName;
    return () => { document.documentElement.style.removeProperty("--green"); };
  }, [companySettings.primaryColor]);

  // عرض نقل بيانات المتصفح القديمة مرة واحدة لو الحساب فاضي
  useEffect(() => {
    if (store.loading || !isSuperAdmin) return;
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
  const saveSettings = async (settings: CompanySettings) => {
    const saved = await saveCompanySettings(settings);
    setCompanySettings(saved);
    setContentError("");
  };
  const uploadImage = (file: File, kind: "logo" | "banner") =>
    uploadCompanyImage(file, kind, session.user.id);
  const savePage = async (item: Omit<ContentPage, "id">, id?: string) => {
    const saved = await saveContentPage(item, id);
    setContentPages((current) => id
      ? current.map((p) => p.id === id ? saved : p)
      : [...current, saved]);
    setContentError("");
  };
  const deletePage = async (id: string) => {
    await deleteContentPage(id);
    setContentPages((current) => current.filter((p) => p.id !== id));
    if (page === `content:${id}`) setPage("dash");
    setContentError("");
  };
  const publicPages = contentPages.filter((item) => item.published);

  return (
    <div className="layout">
      <Sidebar page={page} onChange={setPage} onExport={exportData} onImport={importData}
        pages={pages} roleLabel={ROLE_LABELS[role] ?? role}
        email={session.user.email ?? ""} onLogout={() => supabase.auth.signOut()}
        contentPages={publicPages} logoUrl={companySettings.logoUrl}
        canExport={isSuperAdmin || permissions.includes("dashboard.read") || permissions.includes("reports.read")}
        canImport={isSuperAdmin} />
      <main className="content">
        {contentError && <div className="alert red">⚠️ {contentError} — شغّل ترحيلات Supabase بالترتيب حتى schema_v6.sql.</div>}
        {store.loading ? <div className="splash">جاري التحميل…</div> : (
          <>
            {page === "dash" && <Dashboard db={store.db} settings={companySettings} />}
            {page === "sales" && <SalesPage store={store} />}
            {page === "purchases" && <PurchasesPage store={store} />}
            {page === "returns" && <ReturnsPage store={store} />}
            {page === "expenses" && <ExpensesPage store={store} />}
            {page === "traders" && <PartiesPage store={store} kind="traders" />}
            {page === "suppliers" && <PartiesPage store={store} kind="suppliers" />}
            {page === "products" && <ProductsPage store={store} />}
            {page === "warehouses" && <WarehousesPage store={store} />}
            {page === "reports" && <ReportsPage store={store} />}
            {page === "permissions" && isSuperAdmin && <RoleManagementPage myId={session.user.id} />}
            {page === "content" && (contentLoading ? <div className="splash">جاري تحميل المحتوى…</div> : (
              <ContentManagement settings={companySettings} pages={contentPages} error={contentError}
                onSaveSettings={saveSettings} onUploadImage={uploadImage}
                onSavePage={savePage} onDeletePage={deletePage} />
            ))}
            {page.startsWith("content:") && (() => {
              const content = publicPages.find((item) => `content:${item.id}` === page);
              return content ? <ContentPageView page={content} /> : <div className="alert">الصفحة غير متاحة أو تم إلغاء نشرها.</div>;
            })()}
          </>
        )}
      </main>
    </div>
  );
}
