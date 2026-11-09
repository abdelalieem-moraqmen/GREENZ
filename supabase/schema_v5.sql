-- Tighten dynamic read policies so dashboard/report access alone doesn't expose every ERP table.
-- Run after schema_v4.sql.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'traders','suppliers','products','warehouses','transfers','sales','purchases',
    'sales_returns','purchase_returns','expenses','payments'
  ]
  loop
    execute format('drop policy if exists "owner_all" on public.%I', table_name);
    execute format('drop policy if exists "erp_read" on public.%I', table_name);
    execute format('drop policy if exists "erp_write" on public.%I', table_name);
    execute format('drop policy if exists "dynamic_read" on public.%I', table_name);
    execute format('create policy "dynamic_read" on public.%I for select to authenticated
      using (public.has_permission(%L))',
      table_name, table_name || '.read');
  end loop;
end $$;

-- Sales users need read-only access to the stock ledger used by invoice validation.
insert into public.role_permissions (role_key, permission_key)
values
  ('sales', 'purchases.read'),
  ('sales', 'purchase_returns.read'),
  ('sales', 'transfers.read'),
  ('sales', 'warehouses.read'),
  ('driver', 'traders.read'),
  ('driver', 'purchases.read'),
  ('driver', 'sales_returns.read'),
  ('driver', 'purchase_returns.read'),
  ('driver', 'transfers.read'),
  ('driver', 'warehouses.read')
on conflict do nothing;

notify pgrst, 'reload schema';
