import { useMemo, useRef, useState } from "react";
import { COLLECTION_LABELS, exportWorkbook, importWorkbook } from "../spreadsheets";
import type { Store } from "../store";
import type { Collection } from "../types";

export function SpreadsheetTools({ store, collections }: { store: Store; collections: Collection[] }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const readable = useMemo(() => collections.filter((collection) => store.can(collection, "read")), [collections, store]);
  const importable = useMemo(() => readable.filter((collection) =>
    store.can(collection, "create") || store.can(collection, "update")), [readable, store]);

  const exportData = async (template = false) => {
    if (!readable.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await exportWorkbook(
        template ? importable : readable,
        store.db,
        template ? "قالب-استيراد-المميز.xlsx" : "بيانات-المميز.xlsx",
        template,
      );
      if (template) setMessage("تم تنزيل قالب Excel. املأ الأعمدة كما هي ثم ارفع الملف للاستيراد.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const imported = await importWorkbook(file, importable);
      const summary = Object.entries(imported)
        .map(([collection, rows]) => `${COLLECTION_LABELS[collection as Collection]}: ${rows.length}`)
        .join("\n");
      if (!confirm(`سيتم استيراد الصفوف التالية. الصف الذي يحمل ID موجوداً سيتم تحديثه، وإلا سيُضاف كسجل جديد:\n\n${summary}\n\nهل تريد المتابعة؟`)) return;
      const results: string[] = [];
      for (const [collection, rows] of Object.entries(imported)) {
        const result = await store.importRows(collection as Collection, rows);
        results.push(`${COLLECTION_LABELS[collection as Collection]}: ${result.created} إضافة، ${result.updated} تعديل`);
      }
      setMessage(`اكتمل الاستيراد:\n${results.join("\n")}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (!readable.length) return null;
  return (
    <div className="spreadsheet-tools">
      <button type="button" className="btn sm blue" disabled={busy} onClick={() => void exportData()}>
        {busy ? "جارٍ تجهيز الملف…" : "⬇ تصدير Excel"}
      </button>
      {importable.length > 0 && (
        <>
          <button type="button" className="btn sm amber" disabled={busy} onClick={() => void exportData(true)}>قالب استيراد</button>
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => fileInput.current?.click()}>⬆ استيراد Excel</button>
          <input ref={fileInput} className="spreadsheet-file" type="file" accept=".xlsx" disabled={busy}
            onChange={(event) => void importData(event.target.files?.[0])} />
        </>
      )}
      {message && <span className="spreadsheet-message" role="status">{message}</span>}
      {error && <span className="spreadsheet-error" role="alert">{error}</span>}
    </div>
  );
}
