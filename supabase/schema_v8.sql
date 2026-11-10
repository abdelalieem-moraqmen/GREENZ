-- Client workbook invoice numbers and discounts.
-- Run after schema_v7.sql.

alter table public.sales
  add column if not exists invoice_number text not null default '',
  add column if not exists discount numeric not null default 0;

alter table public.purchases
  add column if not exists invoice_number text not null default '',
  add column if not exists discount numeric not null default 0;

alter table public.sales_returns
  add column if not exists invoice_number text not null default '';

alter table public.purchase_returns
  add column if not exists invoice_number text not null default '';

alter table public.sales
  drop constraint if exists sales_discount_nonnegative;
alter table public.sales
  add constraint sales_discount_nonnegative check (discount >= 0);

alter table public.purchases
  drop constraint if exists purchases_discount_nonnegative;
alter table public.purchases
  add constraint purchases_discount_nonnegative check (discount >= 0);

notify pgrst, 'reload schema';
