import { useState, type ReactNode } from "react";
import { fmt } from "../calc";
import { NAV_ITEMS } from "../constants";
import type { PageKey } from "../types";

/* ---------- Sidebar ---------- */
export function Sidebar(props: {
  page: PageKey;
  onChange: (p: PageKey) => void;
  onExport: () => void;
  onImport: (f: File) => void;
  email?: string;
  onLogout?: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-icon">🌿</span>
        <div>
          <b>مبيدات المصري</b>
          <small>إدارة المحل والتوزيع</small>
        </div>
      </div>
      <nav>
        {NAV_ITEMS.map((n) => (
          <button
            key={n.key}
            className={"nav-item" + (n.key === props.page ? " active" : "")}
            onClick={() => props.onChange(n.key)}
          >
            <span>{n.icon}</span> {n.label}
          </button>
        ))}
      </nav>
      <div className="side-footer">
        {props.email && <div className="user-box">👤 {props.email}</div>}
        {props.onLogout && <button className="ghost" onClick={props.onLogout}>🚪 تسجيل الخروج</button>}
        <button className="ghost" onClick={props.onExport}>⬇ نسخة احتياطية</button>
        <label className="ghost">
          ⬆ استرجاع
          <input type="file" accept=".json" hidden
            onChange={(e) => e.target.files?.[0] && props.onImport(e.target.files[0])} />
        </label>
      </div>
    </aside>
  );
}

/* ---------- Page header ---------- */
export function PageHeader(props: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h2>{props.title}</h2>
        {props.subtitle && <p>{props.subtitle}</p>}
      </div>
      <div>{props.children}</div>
    </div>
  );
}

/* ---------- Stat card ---------- */
export type Tone = "green" | "red" | "orange" | "blue" | "neutral";
export function StatCard(props: { label: string; value: number; icon: string; tone?: Tone; money?: boolean }) {
  const tone = props.tone ?? "neutral";
  return (
    <div className={`stat tone-${tone}`}>
      <div className="stat-icon">{props.icon}</div>
      <div>
        <small>{props.label}</small>
        <b>{fmt(props.value)}{props.money === false ? "" : " ج"}</b>
      </div>
    </div>
  );
}

/* ---------- Panel ---------- */
export function Panel(props: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={"panel " + (props.className ?? "")}>
      {props.title && <h3>{props.title}</h3>}
      {props.children}
    </section>
  );
}

/* ---------- Form fields ---------- */
export function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function Select(props: {
  name: string;
  options: { value: string; label: string }[] | string[];
  defaultValue?: string;
  onChange?: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <select name={props.name} defaultValue={props.defaultValue}
      onChange={(e) => props.onChange?.(e.target.value)}>
      {props.allowEmpty && <option value="">—</option>}
      {props.options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

/* ---------- Data table ---------- */
export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}
export function DataTable<T extends { id: string }>(props: {
  columns: Column<T>[];
  rows: T[];
  onDelete?: (id: string) => void;
  onEdit?: (row: T) => void;
  extraActions?: (row: T) => ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {props.columns.map((c) => <th key={c.header}>{c.header}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 && (
            <tr><td colSpan={props.columns.length + 1} className="empty">لا توجد بيانات بعد</td></tr>
          )}
          {props.rows.map((r) => (
            <tr key={r.id}>
              {props.columns.map((c) => <td key={c.header}>{c.cell(r)}</td>)}
              <td className="actions">
                {props.extraActions?.(r)}
                {props.onEdit && <button className="btn sm amber" onClick={() => props.onEdit!(r)}>تعديل</button>}
                {props.onDelete && (
                  <button className="btn sm danger"
                    onClick={() => confirm("متأكد من الحذف؟") && props.onDelete!(r.id)}>حذف</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Charts ---------- */
export function BarList(props: { data: [string, number][]; color?: string }) {
  const max = props.data[0]?.[1] || 1;
  if (!props.data.length) return <p className="empty">لا توجد بيانات بعد</p>;
  return (
    <div className="barlist">
      {props.data.map(([label, v]) => (
        <div className="barrow" key={label}>
          <span className="barlabel">{label}</span>
          <div className="bartrack">
            <div className="barfill" style={{ width: `${(v / max) * 100}%`, background: props.color }} />
          </div>
          <span className="barval">{fmt(v)}</span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyChart(props: { data: [string, { revenue: number; spending: number }][] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...props.data.flatMap(([, v]) => [v.revenue, v.spending]));
  if (!props.data.length) return <p className="empty">لا توجد بيانات بعد</p>;
  return (
    <div>
      <div className="mchart">
        {props.data.map(([month, v]) => (
          <div className="mcol" key={month} onMouseEnter={() => setHover(month)} onMouseLeave={() => setHover(null)}>
            {hover === month && (
              <div className="tip">
                <div className="g">إيراد: {fmt(v.revenue)}</div>
                <div className="r">مصروف: {fmt(v.spending)}</div>
              </div>
            )}
            <div className="mbars">
              <i style={{ height: `${(v.revenue / max) * 100}%` }} className="rev" />
              <i style={{ height: `${(v.spending / max) * 100}%` }} className="spend" />
            </div>
            <small>{month}</small>
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i className="dot rev" /> إيرادات</span>
        <span><i className="dot spend" /> مشتريات + مصروفات</span>
      </div>
    </div>
  );
}
