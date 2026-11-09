import { useState } from "react";
import { BarList, MonthlyChart, PageHeader, Panel, Select, StatCard, Field } from "../components/ui";
import { computeSummary, expiringBatches, fmt, saleLines, saleTotal, groupSum, monthlySeries, nameOf, stockOf, supplierDebt, traderDebt } from "../calc";
import type { CompanySettings, DB, Period } from "../types";

export function Dashboard({ db, settings }: { db: DB; settings: CompanySettings }) {
  const [period, setPeriod] = useState<Period>("all");
  const s = computeSummary(db, period);

  const byGov = groupSum(s.S, (x) => x.gov, saleTotal).slice(0, 10);
  const byCat = groupSum(s.E, (x) => x.category, (x) => x.amount);
  const topTraders = groupSum(s.S, (x) => nameOf(db.traders, x.traderId), saleTotal).slice(0, 5);
  const topProducts = groupSum(saleLines(s.S), (x) => nameOf(db.products, x.productId), (x) => x.qty * x.price).slice(0, 5);
  const low = db.products.filter((p) => stockOf(db, p.id) <= p.min);
  const expiring = expiringBatches(db);
  const traderDebts = db.traders
    .map((t) => [`${t.name} (${t.gov})`, traderDebt(db, t.id)] as [string, number])
    .filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  const supplierDebts = db.suppliers
    .map((t) => [t.name, supplierDebt(db, t.id)] as [string, number])
    .filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="لوحة التحكم" subtitle="ملخص شغلك كله في مكان واحد">
        <Field label="الفترة">
          <Select name="period" defaultValue={period} onChange={(v) => setPeriod(v as Period)}
            options={[{ value: "all", label: "الكل" }, { value: "month", label: "هذا الشهر" }, { value: "year", label: "هذه السنة" }]} />
        </Field>
      </PageHeader>

      <section className="brand-hero" aria-label={settings.brandName}>
        <div className="brand-hero-copy">
          <span className="brand-hero-eyebrow">{settings.brandName}</span>
          <h2>{settings.tagline}</h2>
          <p>{settings.intro}</p>
          {!!settings.whatsapp.replace(/\D/g, "") && (
            <a className="brand-whatsapp" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
              <span aria-hidden="true">☏</span>
              <span>تواصل مع صاحب الشركة على واتساب</span>
              <b dir="ltr">{settings.whatsapp.startsWith("+") ? settings.whatsapp : `+${settings.whatsapp.replace(/\D/g, "")}`}</b>
            </a>
          )}
          <div className="brand-hero-services">
            {settings.services.map((service, index) => (
              <div className="brand-service" key={`${service.title}-${index}`}>
                <span aria-hidden="true">{service.icon}</span>
                <div><b>{service.title}</b><small>{service.description}</small></div>
              </div>
            ))}
          </div>
        </div>
        <div className="brand-hero-art">
          <img src={settings.bannerUrl || "/banner.jpg"} alt={`بانر ${settings.brandName}`}
            onError={(event) => {
              const image = event.currentTarget;
              if (!image.src.endsWith("/banner.jpg")) image.src = "/banner.jpg";
              else image.hidden = true;
            }} />
        </div>
      </section>

      <div className="stats">
        <StatCard icon="💰" label="إجمالي الإيرادات" value={s.revenue} tone="green" />
        <StatCard icon="🛒" label="المشتريات من الموردين" value={s.purchases} tone="red" />
        <StatCard icon="💸" label="المصروفات التشغيلية" value={s.expenses} tone="red" />
        <StatCard icon="📈" label="مجمل الربح" value={s.gross} tone={s.gross >= 0 ? "green" : "red"} />
        <StatCard icon="🏆" label="صافي الربح" value={s.net} tone={s.net >= 0 ? "green" : "red"} />
        <StatCard icon="🏦" label="النقدية المتاحة" value={s.cash} tone={s.cash >= 0 ? "blue" : "red"} />
        <StatCard icon="🏪" label="مستحق لك عند التجار" value={s.owedByTraders} tone="orange" />
        <StatCard icon="🚚" label="مستحق عليك للموردين" value={s.owedToSuppliers} tone="orange" />
        <StatCard icon="📦" label="قيمة المخزون" value={s.stockValue} tone="neutral" />
      </div>

      {low.length > 0 && (
        <div className="alert">
          ⚠️ أصناف قاربت على النفاد:{" "}
          {low.map((p) => `${p.name} (${fmt(stockOf(db, p.id))} ${p.unit})`).join(" • ")}
        </div>
      )}

      {expiring.length > 0 && (
        <div className="alert red">
          ⏰ مبيدات قاربت على انتهاء الصلاحية (خلال 90 يوماً):{" "}
          {expiring.slice(0, 6).map((i) => `${nameOf(db.products, i.productId)} — ${i.expiry} (متبقي ${fmt(i.remaining)})`).join(" • ")}
        </div>
      )}

      <div className="grid-2">
        <Panel title="الإيرادات والمصروفات شهرياً"><MonthlyChart data={monthlySeries(db)} /></Panel>
        <Panel title="المبيعات حسب المحافظة (أعلى 10)"><BarList data={byGov} /></Panel>
        <Panel title="المصروفات حسب النوع"><BarList data={byCat} color="var(--red)" /></Panel>
        <Panel title="أعلى 5 تجار"><BarList data={topTraders} color="var(--blue)" /></Panel>
        <Panel title="أعلى 5 أصناف مبيعاً"><BarList data={topProducts} color="var(--amber)" /></Panel>
        <Panel title="ديون التجار"><BarList data={traderDebts} color="var(--orange)" /></Panel>
        <Panel title="مستحقات الموردين"><BarList data={supplierDebts} color="var(--orange)" /></Panel>
      </div>
    </>
  );
}
