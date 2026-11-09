-- Public read access for the company landing page only.
-- Run after schema_v5.sql.

alter table public.company_settings
  add column if not exists landing_sections jsonb not null default '{
    "servicesTitle":"كل احتياجات أرضك في مكان واحد",
    "servicesIntro":"اختيارات موثوقة وخبرة تساعدك على رعاية محصولك من بداية الموسم حتى الحصاد.",
    "aboutTitle":"نزرع الثقة قبل كل شيء",
    "contactTitle":"جاهز لموسم زراعي أفضل؟",
    "contactIntro":"تواصل مع فريق المميز للخدمات الزراعية، وسنساعدك في اختيار الحل المناسب."
  }'::jsonb;

drop policy if exists "company_settings_public_read" on public.company_settings;
create policy "company_settings_public_read" on public.company_settings
  for select to anon using (true);
revoke all on public.company_settings from anon;
grant select (
  id, brand_name, tagline, intro, whatsapp, logo_url, banner_url,
  primary_color, services, landing_sections
) on public.company_settings to anon;

drop policy if exists "content_pages_public_read" on public.content_pages;
create policy "content_pages_public_read" on public.content_pages
  for select to anon using (published = true);
revoke all on public.content_pages from anon;
grant select (id, title, body, published, created_at) on public.content_pages to anon;

notify pgrst, 'reload schema';
