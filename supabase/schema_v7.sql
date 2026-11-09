-- Legacy workbook opening balances and source identifiers.
-- Run after schema_v6.sql.

alter table public.traders
  add column if not exists opening_balance numeric not null default 0;

alter table public.suppliers
  add column if not exists opening_balance numeric not null default 0;

alter table public.products
  add column if not exists opening_qty numeric not null default 0,
  add column if not exists opening_cost numeric not null default 0;

alter table public.traders
  drop constraint if exists traders_opening_balance_nonnegative;
alter table public.suppliers
  drop constraint if exists suppliers_opening_balance_nonnegative;
alter table public.products
  drop constraint if exists products_opening_values_nonnegative;

alter table public.products
  add constraint products_opening_values_nonnegative
  check (opening_qty >= 0 and opening_cost >= 0);

notify pgrst, 'reload schema';
