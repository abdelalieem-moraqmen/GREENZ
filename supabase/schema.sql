-- المميز للخدمات الزراعية — Supabase schema
-- شغّل الملف كله في: Supabase Dashboard → SQL Editor → New query → Run

create table if not exists public.traders (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text default '',
  gov text default ''
);

create table if not exists public.suppliers (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text default '',
  gov text default ''
);

create table if not exists public.products (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  unit text default '',
  price numeric not null default 0,
  min numeric not null default 0
);

create table if not exists public.sales (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  trader_id text not null,
  gov text default '',
  items jsonb not null default '[]',
  paid numeric not null default 0,
  note text default ''
);

create table if not exists public.purchases (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  supplier_id text not null,
  items jsonb not null default '[]',
  paid numeric not null default 0,
  note text default ''
);

create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  category text not null,
  gov text default '',
  amount numeric not null default 0,
  note text default ''
);

create table if not exists public.payments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('trader', 'supplier')),
  party_id text not null,
  amount numeric not null default 0
);

-- Row Level Security: كل مستخدم يشوف بياناته بس
do $$
declare t text;
begin
  foreach t in array array['traders','suppliers','products','sales','purchases','expenses','payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_idx', t);
  end loop;
end $$;
