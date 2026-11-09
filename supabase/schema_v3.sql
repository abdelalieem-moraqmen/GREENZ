-- المميز للخدمات الزراعية — إعدادات الهوية وصفحات المحتوى
-- شغّله في Supabase SQL Editor بعد schema.sql و schema_v2.sql.

create table if not exists public.company_settings (
  id text primary key default 'main' check (id = 'main'),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand_name text not null default 'المميز للخدمات الزراعية',
  tagline text not null default '',
  intro text not null default '',
  whatsapp text not null default '',
  logo_url text not null default '/logo.png',
  banner_url text not null default '/banner.jpg',
  primary_color text not null default '#2e9e4f',
  services jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists public.content_pages (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;
alter table public.content_pages enable row level security;

drop policy if exists "company_settings_read" on public.company_settings;
drop policy if exists "company_settings_write" on public.company_settings;
create policy "company_settings_read" on public.company_settings for select to authenticated
  using (public.my_role() <> 'pending');
create policy "company_settings_write" on public.company_settings for all to authenticated
  using (public.my_role() = any(array['admin','accountant']::text[]))
  with check (public.my_role() = any(array['admin','accountant']::text[]));

drop policy if exists "content_pages_read" on public.content_pages;
drop policy if exists "content_pages_write" on public.content_pages;
create policy "content_pages_read" on public.content_pages for select to authenticated
  using (public.my_role() <> 'pending');
create policy "content_pages_write" on public.content_pages for all to authenticated
  using (public.my_role() = any(array['admin','accountant']::text[]))
  with check (public.my_role() = any(array['admin','accountant']::text[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-assets', 'company-assets', true, 5242880, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists "company_assets_editor_upload" on storage.objects;
drop policy if exists "company_assets_editor_update" on storage.objects;
drop policy if exists "company_assets_editor_delete" on storage.objects;
create policy "company_assets_editor_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_role() = any(array['admin','accountant']::text[]));
create policy "company_assets_editor_update" on storage.objects for update to authenticated
  using (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_role() = any(array['admin','accountant']::text[]))
  with check (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_role() = any(array['admin','accountant']::text[]));
create policy "company_assets_editor_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_role() = any(array['admin','accountant']::text[]));

notify pgrst, 'reload schema';
