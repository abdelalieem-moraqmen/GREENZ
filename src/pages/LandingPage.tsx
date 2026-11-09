import { useEffect, useState } from "react";
import { PWAInstallButton } from "../components/ui";
import { DEFAULT_COMPANY_SETTINGS, loadSiteContent } from "../siteContent";
import type { CompanySettings, ContentPage } from "../types";

const whatsappUrl = (value: string) => {
  const phone = value.replace(/\D/g, "");
  return phone ? `https://wa.me/${phone}` : "";
};

export function LandingPage() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [contentUnavailable, setContentUnavailable] = useState(false);

  useEffect(() => {
    loadSiteContent()
      .then(({ settings: loadedSettings, pages: loadedPages }) => {
        setSettings(loadedSettings);
        setPages(loadedPages.filter((page) => page.published));
      })
      .catch(() => setContentUnavailable(true));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--green", settings.primaryColor);
    document.title = settings.brandName;
    return () => { document.documentElement.style.removeProperty("--green"); };
  }, [settings.brandName, settings.primaryColor]);

  const contactUrl = whatsappUrl(settings.whatsapp);

  return (
    <div className="landing" dir="rtl">
      <header className="landing-header">
        <a className="landing-brand" href="#home" aria-label={settings.brandName}>
          <img src={settings.logoUrl || "/logo.png"} alt="" />
          <span>{settings.brandName}</span>
        </a>
        <nav aria-label="التنقل الرئيسي">
          <a href="#services">خدماتنا</a>
          <a href="#about">عن الشركة</a>
          <a href="#contact">تواصل معنا</a>
        </nav>
        <a className="landing-internal-link" href="/erp">دخول النظام الداخلي</a>
        <PWAInstallButton className="landing-install" />
      </header>

      <main>
        <section className="landing-hero" id="home">
          <div className="landing-hero-copy">
            <span className="landing-kicker">حلول زراعية تثق بها</span>
            <h1>{settings.tagline}</h1>
            <p>{settings.intro}</p>
            <div className="landing-actions">
              {contactUrl && <a className="landing-button primary" href={contactUrl} target="_blank" rel="noreferrer">تواصل معنا على واتساب <span>↖</span></a>}
              <a className="landing-button secondary" href="#services">اكتشف خدماتنا <span>↓</span></a>
            </div>
            <div className="landing-trust"><span>🌱</span> شريكك في كل موسم زراعي</div>
          </div>
          <div className="landing-hero-image">
            <div className="landing-image-orbit" />
            <img src={settings.bannerUrl || "/banner.jpg"} alt={`خدمات ${settings.brandName}`}
              onError={(event) => {
                const image = event.currentTarget;
                if (!image.src.endsWith("/banner.jpg")) image.src = "/banner.jpg";
                else image.hidden = true;
              }} />
            <span className="landing-image-note">ننمو معًا 🌿</span>
          </div>
          <a className="landing-scroll" href="#services" aria-label="انتقل إلى الخدمات">↓</a>
        </section>

        <section className="landing-services landing-section" id="services">
          <div className="landing-section-heading">
            <span className="landing-kicker">ماذا نقدم؟</span>
            <h2>{settings.landingSections.servicesTitle}</h2>
            <p>{settings.landingSections.servicesIntro}</p>
          </div>
          <div className="landing-service-grid">
            {settings.services.map((service, index) => (
              <article className="landing-service-card" key={`${service.title}-${index}`}>
                <span className="landing-service-icon" aria-hidden="true">{service.icon || "🌿"}</span>
                <span className="landing-service-number">0{index + 1}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a href="#contact" aria-label={`اسألنا عن ${service.title}`}>اسألنا <span>←</span></a>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-about" id="about">
          <div className="landing-about-mark" aria-hidden="true">🌾</div>
          <div>
            <span className="landing-kicker">{settings.brandName}</span>
            <h2>{settings.landingSections.aboutTitle}</h2>
            <p>{settings.intro}</p>
          </div>
          <div className="landing-about-stat"><strong>معك</strong><span>في كل خطوة من الموسم</span></div>
        </section>

        {pages.length > 0 && (
          <section className="landing-section landing-published">
            <div className="landing-section-heading">
              <span className="landing-kicker">من الشركة</span>
              <h2>أخبار ومعلومات زراعية</h2>
            </div>
            <div className="landing-published-grid">
              {pages.map((page) => (
                <article className="landing-published-card" key={page.id}>
                  <h3>{page.title}</h3>
                  <p>{page.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="landing-contact" id="contact">
          <div>
            <span className="landing-kicker">نحن هنا لمساعدتك</span>
            <h2>{settings.landingSections.contactTitle}</h2>
            <p>{settings.landingSections.contactIntro}</p>
          </div>
          {contactUrl && <a className="landing-button light" href={contactUrl} target="_blank" rel="noreferrer">ابدأ محادثة واتساب <span>↖</span></a>}
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="#home">
          <img src={settings.logoUrl || "/logo.png"} alt="" />
          <span>{settings.brandName}</span>
        </a>
        <span>© {new Date().getFullYear()} {settings.brandName} — جميع الحقوق محفوظة</span>
        {contactUrl && <a href={contactUrl} target="_blank" rel="noreferrer">واتساب الشركة</a>}
      </footer>
      {contentUnavailable && <span className="landing-content-status" role="status">يتم عرض المحتوى الافتراضي مؤقتًا.</span>}
    </div>
  );
}
