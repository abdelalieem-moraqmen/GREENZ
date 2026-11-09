-- GREENZ ERP — الإصدار 2: مستخدمون وصلاحيات + مخازن + مرتجعات
-- شغّله في Supabase → SQL Editor بعد schema.sql (آمن لو اتشغّل أكتر من مرة)

-- ============ المستخدمون والأدوار ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text default '',
  role text not null default 'pending'
    check (role in ('admin','accountant','sales','driver','pending'))
);
alter table public.profiles enable row level security;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending')
$$;

-- أول مستخدم يتسجّل = مدير، والباقي "بانتظار الموافقة" لحد ما المدير يحدد دورهم
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- المستخدمون الحاليون: الأقدم مدير والباقي بانتظار الموافقة
insert into public.profiles (id, email, role)
select u.id, u.email,
  case when u.id = (select id from auth.users order by created_at limit 1) then 'admin' else 'pending' end
from auth.users u
on conflict (id) do nothing;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.my_role() = 'admin');
create policy "profiles_update" on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ============ جداول جديدة ============
create table if not exists public.warehouses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  gov text default ''
);
create table if not exists public.sales_returns (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  trader_id text not null,
  warehouse_id text default '',
  items jsonb not null default '[]',
  note text default ''
);
create table if not exists public.purchase_returns (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  supplier_id text not null,
  warehouse_id text default '',
  items jsonb not null default '[]',
  note text default ''
);
create table if not exists public.transfers (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  from_id text default '',
  to_id text default '',
  items jsonb not null default '[]',
  note text default ''
);
alter table public.sales add column if not exists warehouse_id text default '';
alter table public.purchases add column if not exists warehouse_id text default '';

-- ============ سياسات الصلاحيات (RLS) ============
-- القراءة: أي مستخدم معتمد (غير pending). الكتابة: حسب الدور.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('traders',          array['admin','accountant','sales']),
    ('suppliers',        array['admin','accountant']),
    ('products',         array['admin','accountant']),
    ('warehouses',       array['admin','accountant']),
    ('transfers',        array['admin','accountant']),
    ('sales',            array['admin','accountant','sales','driver']),
    ('purchases',        array['admin','accountant']),
    ('sales_returns',    array['admin','accountant','sales']),
    ('purchase_returns', array['admin','accountant']),
    ('expenses',         array['admin','accountant','driver']),
    ('payments',         array['admin','accountant'])
  ) as x(tbl, writers)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('drop policy if exists "owner_all" on public.%I', r.tbl);
    execute format('drop policy if exists "erp_read" on public.%I', r.tbl);
    execute format('drop policy if exists "erp_write" on public.%I', r.tbl);
    execute format('create policy "erp_read" on public.%I for select to authenticated
                      using (public.my_role() <> ''pending'')', r.tbl);
    execute format('create policy "erp_write" on public.%I for all to authenticated
                      using (public.my_role() = any(%L::text[]))
                      with check (public.my_role() = any(%L::text[]))', r.tbl, r.writers, r.writers);
    execute format('create index if not exists %I on public.%I (user_id)', r.tbl || '_user_idx', r.tbl);
  end loop;
end $$;

notify pgrst, 'reload schema';
