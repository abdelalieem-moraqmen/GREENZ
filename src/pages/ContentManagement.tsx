import { useEffect, useState } from "react";
import { Field, PageHeader, Panel } from "../components/ui";
import type { CompanySettings, ContentPage } from "../types";

type Props = {
  settings: CompanySettings;
  pages: ContentPage[];
  error?: string;
  onSaveSettings: (settings: CompanySettings) => Promise<void>;
  onUploadImage: (file: File, kind: "logo" | "banner") => Promise<string>;
  onSavePage: (page: Omit<ContentPage, "id">, id?: string) => Promise<void>;
  onDeletePage: (id: string) => Promise<void>;
};

export function ContentManagement(props: Props) {
  const [settings, setSettings] = useState(props.settings);
  const [editing, setEditing] = useState<ContentPage | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"brand" | "pages">("brand");

  useEffect(() => { setSettings(props.settings); }, [props.settings]);

  const updateSetting = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const upload = async (file: File | undefined, kind: "logo" | "banner") => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const url = await props.onUploadImage(file, kind);
      updateSetting(kind === "logo" ? "logoUrl" : "bannerUrl", url);
      setMessage("تم رفع الصورة. احفظ التغييرات لتطبيقها.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await props.onSaveSettings(settings);
      setMessage("تم حفظ إعدادات الهوية والمحتوى.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const startNewPage = () => {
    setEditing(null);
    setTitle("");
    setBody("");
    setPublished(false);
  };

  const startEditPage = (page: ContentPage) => {
    setEditing(page);
    setTitle(page.title);
    setBody(page.body);
    setPublished(page.published);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const savePage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return setMessage("اكتب عنواناً للصفحة.");
    setBusy(true);
    setMessage("");
    try {
      await props.onSavePage({ title: title.trim(), body, published }, editing?.id);
      setMessage(editing ? "تم تحديث الصفحة." : "تم إنشاء الصفحة.");
      startNewPage();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const deletePage = async (page: ContentPage) => {
    if (!confirm(`هل تريد حذف صفحة "${page.title}"؟`)) return;
    setBusy(true);
    setMessage("");
    try {
      await props.onDeletePage(page.id);
      if (editing?.id === page.id) startNewPage();
      setMessage("تم حذف الصفحة.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="إدارة الموقع والمحتوى" subtitle="تعديل صفحة الهبوط العامة وإدارة محتوى الموقع">
        <div className="tabs">
          <button type="button" className={tab === "brand" ? "on" : ""} onClick={() => setTab("brand")}>الهوية والمظهر</button>
          <button type="button" className={tab === "pages" ? "on" : ""} onClick={() => setTab("pages")}>الصفحات</button>
          <a className="btn sm blue" href="/" target="_blank" rel="noreferrer">معاينة الموقع</a>
        </div>
      </PageHeader>
      {props.error && <div className="alert red">{props.error} — شغّل ترحيلات Supabase بالترتيب حتى schema_v6.sql.</div>}
      {message && <div className="alert" role="status">{message}</div>}

      {tab === "brand" ? (
        <Panel title="هوية الشركة وصفحة الهبوط">
          <form className="form-grid cms-form" onSubmit={saveSettings}>
            <Field label="اسم النشاط"><input value={settings.brandName} onChange={(e) => updateSetting("brandName", e.target.value)} required /></Field>
            <Field label="عنوان البانر"><input value={settings.tagline} onChange={(e) => updateSetting("tagline", e.target.value)} required /></Field>
            <Field label="رقم واتساب (بصيغة دولية)">
              <input dir="ltr" value={settings.whatsapp} onChange={(e) => updateSetting("whatsapp", e.target.value)} placeholder="201141645190" />
            </Field>
            <Field label="اللون الأساسي"><input type="color" value={settings.primaryColor} onChange={(e) => updateSetting("primaryColor", e.target.value)} /></Field>
            <Field label="نبذة الشركة"><textarea rows={3} value={settings.intro} onChange={(e) => updateSetting("intro", e.target.value)} /></Field>
            <Field label="عنوان قسم الخدمات"><input value={settings.landingSections.servicesTitle} onChange={(e) => updateSetting("landingSections", { ...settings.landingSections, servicesTitle: e.target.value })} /></Field>
            <Field label="وصف قسم الخدمات"><textarea rows={2} value={settings.landingSections.servicesIntro} onChange={(e) => updateSetting("landingSections", { ...settings.landingSections, servicesIntro: e.target.value })} /></Field>
            <Field label="عنوان قسم عن الشركة"><input value={settings.landingSections.aboutTitle} onChange={(e) => updateSetting("landingSections", { ...settings.landingSections, aboutTitle: e.target.value })} /></Field>
            <Field label="عنوان قسم التواصل"><input value={settings.landingSections.contactTitle} onChange={(e) => updateSetting("landingSections", { ...settings.landingSections, contactTitle: e.target.value })} /></Field>
            <Field label="وصف قسم التواصل"><textarea rows={2} value={settings.landingSections.contactIntro} onChange={(e) => updateSetting("landingSections", { ...settings.landingSections, contactIntro: e.target.value })} /></Field>

            {settings.services.map((service, index) => (
              <div className="cms-service-fields" key={index}>
                <Field label={`أيقونة الخدمة ${index + 1}`}><input value={service.icon} onChange={(e) => updateSetting("services", settings.services.map((item, i) => i === index ? { ...item, icon: e.target.value } : item))} /></Field>
                <Field label="اسم الخدمة"><input value={service.title} onChange={(e) => updateSetting("services", settings.services.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} /></Field>
                <Field label="وصف الخدمة"><input value={service.description} onChange={(e) => updateSetting("services", settings.services.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} /></Field>
                <button type="button" className="btn sm danger" onClick={() => updateSetting("services", settings.services.filter((_, i) => i !== index))}>حذف الخدمة</button>
              </div>
            ))}
            <button type="button" className="btn sm blue cms-add-service" onClick={() => updateSetting("services", [...settings.services, { icon: "🌿", title: "", description: "" }])}>＋ إضافة خدمة</button>

            <div className="cms-assets">
              <Field label="الشعار">
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
                  onChange={(e) => { void upload(e.target.files?.[0], "logo"); e.currentTarget.value = ""; }} />
                <img src={settings.logoUrl} alt="معاينة الشعار" />
              </Field>
              <Field label="صورة الصفحة الرئيسية والنظام">
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
                  onChange={(e) => { void upload(e.target.files?.[0], "banner"); e.currentTarget.value = ""; }} />
                <img src={settings.bannerUrl} alt="معاينة البانر" />
              </Field>
            </div>
            <button className="btn primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ التغييرات"}</button>
          </form>
        </Panel>
      ) : (
        <>
          <Panel title={editing ? "تعديل صفحة" : "إنشاء صفحة جديدة"}>
            <form className="form-grid cms-form" onSubmit={savePage}>
              <Field label="عنوان الصفحة"><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
              <Field label="محتوى الصفحة"><textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="اكتب نص الصفحة هنا" /></Field>
              <label className="cms-publish"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> نشر الصفحة للمستخدمين</label>
              <div className="form-actions">
                <button className="btn primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : editing ? "حفظ الصفحة" : "إنشاء الصفحة"}</button>
                {editing && <button type="button" className="btn muted" onClick={startNewPage}>إلغاء التعديل</button>}
              </div>
            </form>
          </Panel>
          <Panel title="صفحات الموقع">
            {!props.pages.length ? <p className="empty">لا توجد صفحات بعد.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>العنوان</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
                <tbody>{props.pages.map((page) => (
                  <tr key={page.id}>
                    <td>{page.title}</td>
                    <td><span className={"badge " + (page.published ? "green" : "orange")}>{page.published ? "منشورة" : "مسودة"}</span></td>
                    <td className="actions">
                      <button type="button" className="btn sm blue" onClick={() => startEditPage(page)}>تعديل</button>
                      <button type="button" className="btn sm danger" disabled={busy} onClick={() => void deletePage(page)}>حذف</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

export function ContentPageView({ page }: { page: ContentPage }) {
  return (
    <>
      <PageHeader title={page.title} />
      <Panel><div className="cms-page-body">{page.body}</div></Panel>
    </>
  );
}
