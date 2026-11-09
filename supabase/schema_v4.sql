-- المميز للخدمات الزراعية — سوبر أدمن وأدوار بصلاحيات قابلة للتخصيص
-- شغّله في Supabase SQL Editor بعد schema.sql و schema_v2.sql و schema_v3.sql.

create table if not exists public.role_catalog (
  role_key text primary key,
  label text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.permission_catalog (
  permission_key text primary key,
  label text not null,
  group_name text not null
);

create table if not exists public.role_permissions (
  role_key text not null references public.role_catalog(role_key) on delete cascade,
  permission_key text not null references public.permission_catalog(permission_key) on delete cascade,
  primary key (role_key, permission_key)
);

alter table public.role_catalog enable row level security;
alter table public.permission_catalog enable row level security;
alter table public.role_permissions enable row level security;

alter table public.profiles drop constraint if exists profiles_role_check;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and lower(u.email) = 'abmena333@gmail.com'
  )
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_super_admin() then 'superadmin'
    else coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'pending')
  end
$$;

create or replace function public.has_permission(p_permission_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null or public.my_role() = 'pending' then false
    when public.is_super_admin() then true
    else exists (
      select 1 from public.profiles p
      join public.role_permissions rp on rp.role_key = p.role
      where p.id = auth.uid() and rp.permission_key = p_permission_key
    )
  end
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

insert into public.permission_catalog (permission_key, label, group_name)
values
  ('dashboard.read', 'مشاهدة لوحة التحكم', 'لوحة التحكم'),
  ('traders.read', 'عرض التجار', 'التجار'),
  ('traders.create', 'إضافة تاجر', 'التجار'),
  ('traders.update', 'تعديل تاجر', 'التجار'),
  ('traders.delete', 'حذف تاجر', 'التجار'),
  ('suppliers.read', 'عرض الموردين', 'الموردون'),
  ('suppliers.create', 'إضافة مورد', 'الموردون'),
  ('suppliers.update', 'تعديل مورد', 'الموردون'),
  ('suppliers.delete', 'حذف مورد', 'الموردون'),
  ('products.read', 'عرض الأصناف والمخزون', 'الأصناف'),
  ('products.create', 'إضافة صنف', 'الأصناف'),
  ('products.update', 'تعديل صنف', 'الأصناف'),
  ('products.delete', 'حذف صنف', 'الأصناف'),
  ('warehouses.read', 'عرض المخازن', 'المخازن'),
  ('warehouses.create', 'إضافة مخزن', 'المخازن'),
  ('warehouses.update', 'تعديل مخزن', 'المخازن'),
  ('warehouses.delete', 'حذف مخزن', 'المخازن'),
  ('transfers.read', 'عرض التحويلات', 'المخازن'),
  ('transfers.create', 'إنشاء تحويل', 'المخازن'),
  ('transfers.update', 'تعديل تحويل', 'المخازن'),
  ('transfers.delete', 'حذف تحويل', 'المخازن'),
  ('sales.read', 'عرض المبيعات', 'المبيعات'),
  ('sales.create', 'إنشاء فاتورة بيع', 'المبيعات'),
  ('sales.update', 'تعديل فاتورة بيع', 'المبيعات'),
  ('sales.delete', 'حذف فاتورة بيع', 'المبيعات'),
  ('purchases.read', 'عرض المشتريات', 'المشتريات'),
  ('purchases.create', 'إنشاء فاتورة شراء', 'المشتريات'),
  ('purchases.update', 'تعديل فاتورة شراء', 'المشتريات'),
  ('purchases.delete', 'حذف فاتورة شراء', 'المشتريات'),
  ('sales_returns.read', 'عرض مرتجعات المبيعات', 'المرتجعات'),
  ('sales_returns.create', 'إنشاء مرتجع مبيعات', 'المرتجعات'),
  ('sales_returns.update', 'تعديل مرتجع مبيعات', 'المرتجعات'),
  ('sales_returns.delete', 'حذف مرتجع مبيعات', 'المرتجعات'),
  ('purchase_returns.read', 'عرض مرتجعات المشتريات', 'المرتجعات'),
  ('purchase_returns.create', 'إنشاء مرتجع مشتريات', 'المرتجعات'),
  ('purchase_returns.update', 'تعديل مرتجع مشتريات', 'المرتجعات'),
  ('purchase_returns.delete', 'حذف مرتجع مشتريات', 'المرتجعات'),
  ('expenses.read', 'عرض المصروفات', 'المصروفات'),
  ('expenses.create', 'إضافة مصروف', 'المصروفات'),
  ('expenses.update', 'تعديل مصروف', 'المصروفات'),
  ('expenses.delete', 'حذف مصروف', 'المصروفات'),
  ('payments.read', 'عرض الدفعات', 'الدفعات'),
  ('payments.create', 'تسجيل دفعة', 'الدفعات'),
  ('payments.update', 'تعديل دفعة', 'الدفعات'),
  ('payments.delete', 'حذف دفعة', 'الدفعات'),
  ('reports.read', 'عرض التقارير', 'التقارير'),
  ('content.manage', 'إدارة إعدادات ومحتوى الشركة', 'المحتوى')
on conflict (permission_key) do update set label = excluded.label, group_name = excluded.group_name;

insert into public.role_catalog (role_key, label, is_system)
values ('admin', 'مدير', true), ('accountant', 'محاسب', true),
  ('sales', 'مندوب مبيعات', true), ('driver', 'سائق / توزيع', true),
  ('pending', 'بانتظار الموافقة', true)
on conflict (role_key) do update set label = excluded.label, is_system = true;

do $$
declare
  r record;
  action_name text;
  v_permission_key text;
begin
  for r in select * from (values
    ('traders', 'التجار'),
    ('suppliers', 'الموردون'),
    ('products', 'الأصناف'),
    ('warehouses', 'المخازن'),
    ('transfers', 'التحويلات'),
    ('sales', 'المبيعات'),
    ('purchases', 'المشتريات'),
    ('sales_returns', 'مرتجعات المبيعات'),
    ('purchase_returns', 'مرتجعات المشتريات'),
    ('expenses', 'المصروفات'),
    ('payments', 'الدفعات')
  ) as resources(table_name, label)
  loop
    foreach action_name in array array['read','create','update','delete']
    loop
      v_permission_key := r.table_name || '.' || action_name;
      insert into public.permission_catalog (permission_key, label, group_name)
      values (v_permission_key, r.label || ' — ' || case action_name
        when 'read' then 'عرض' when 'create' then 'إضافة'
        when 'update' then 'تعديل' else 'حذف' end, r.label)
      on conflict (permission_key) do update set label = excluded.label, group_name = excluded.group_name;
    end loop;
  end loop;
end $$;

-- الأدوار الأساسية تحتفظ بصلاحياتها الحالية بعد الانتقال للصلاحيات الديناميكية.
insert into public.role_permissions (role_key, permission_key)
select r.role_key, p.permission_key
from (values
  ('admin'), ('accountant')
) as r(role_key)
cross join public.permission_catalog p
where p.permission_key not in ('users.manage', 'roles.manage')
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
values
  ('sales', 'traders.read'), ('sales', 'traders.create'), ('sales', 'traders.update'), ('sales', 'traders.delete'),
  ('sales', 'products.read'),
  ('sales', 'sales.read'), ('sales', 'sales.create'), ('sales', 'sales.update'), ('sales', 'sales.delete'),
  ('sales', 'sales_returns.read'), ('sales', 'sales_returns.create'), ('sales', 'sales_returns.update'), ('sales', 'sales_returns.delete'),
  ('driver', 'products.read'),
  ('driver', 'sales.read'), ('driver', 'sales.create'), ('driver', 'sales.update'), ('driver', 'sales.delete'),
  ('driver', 'expenses.read'), ('driver', 'expenses.create'), ('driver', 'expenses.update'), ('driver', 'expenses.delete')
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
values ('admin', 'dashboard.read'), ('accountant', 'dashboard.read'),
  ('admin', 'reports.read'), ('accountant', 'reports.read'),
  ('admin', 'content.manage'), ('accountant', 'content.manage')
on conflict do nothing;

-- يُرقّى البريد المحدد إلى سوبر أدمن فقط بعد تأكيد ملكية البريد في Supabase Auth.
update public.profiles p set email = u.email, role = 'superadmin'
from auth.users u
where p.id = u.id and u.email_confirmed_at is not null
  and lower(u.email) = 'abmena333@gmail.com';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
    case
      when lower(new.email) = 'abmena333@gmail.com' and new.email_confirmed_at is not null then 'superadmin'
      when lower(new.email) = 'abmena333@gmail.com' then 'pending'
      when not exists (select 1 from public.profiles) then 'admin'
      else 'pending'
    end)
  on conflict (id) do update
    set email = excluded.email,
        role = case
          when excluded.role = 'superadmin' then 'superadmin'
          when profiles.role = 'superadmin' then 'pending'
          else profiles.role
        end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_access_changed on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create trigger on_auth_user_access_changed after update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());
create policy "profiles_update" on public.profiles for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin() and role <> 'superadmin'
    and (role = 'pending' or exists (select 1 from public.role_catalog r where r.role_key = role)));

drop policy if exists "role_catalog_read" on public.role_catalog;
drop policy if exists "role_catalog_write" on public.role_catalog;
create policy "role_catalog_read" on public.role_catalog for select to authenticated
  using (public.my_role() <> 'pending');
create policy "role_catalog_write" on public.role_catalog for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "permission_catalog_read" on public.permission_catalog;
create policy "permission_catalog_read" on public.permission_catalog for select to authenticated
  using (public.my_role() <> 'pending');

drop policy if exists "role_permissions_read" on public.role_permissions;
drop policy if exists "role_permissions_write" on public.role_permissions;
create policy "role_permissions_read" on public.role_permissions for select to authenticated
  using (public.my_role() <> 'pending');
create policy "role_permissions_write" on public.role_permissions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.save_role_permissions(
  p_role_key text, p_label text, p_permission_keys text[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'superadmin_required'; end if;
  if p_role_key !~ '^[a-z][a-z0-9_]{2,62}$' then raise exception 'invalid_role_key'; end if;
  if nullif(trim(p_label), '') is null then raise exception 'role_label_required'; end if;
  if exists (
    select 1 from unnest(coalesce(p_permission_keys, array[]::text[])) requested(permission_key)
    where not exists (select 1 from public.permission_catalog p where p.permission_key = requested.permission_key)
  ) then raise exception 'unknown_permission'; end if;

  insert into public.role_catalog (role_key, label, is_system)
  values (p_role_key, trim(p_label), p_role_key in ('admin','accountant','sales','driver','pending'))
  on conflict (role_key) do update set label = excluded.label;

  delete from public.role_permissions where role_key = p_role_key;
  insert into public.role_permissions (role_key, permission_key)
  select p_role_key, requested.permission_key
  from (select distinct unnest(coalesce(p_permission_keys, array[]::text[])) as permission_key) requested
  on conflict do nothing;
end $$;

create or replace function public.delete_custom_role(p_role_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'superadmin_required'; end if;
  if exists (select 1 from public.role_catalog where role_key = p_role_key and is_system) then
    raise exception 'system_role_cannot_be_deleted';
  end if;
  if exists (select 1 from public.profiles where role = p_role_key) then
    raise exception 'role_is_assigned';
  end if;
  delete from public.role_catalog where role_key = p_role_key;
end $$;

revoke all on function public.save_role_permissions(text, text, text[]) from public;
revoke all on function public.delete_custom_role(text) from public;
grant execute on function public.save_role_permissions(text, text, text[]) to authenticated;
grant execute on function public.delete_custom_role(text) to authenticated;

do $$
declare
  table_name text;
  action_name text;
  policy_name text;
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
      using (public.has_permission(%L) or public.has_permission(''dashboard.read'')
        or public.has_permission(''reports.read''))',
      table_name, table_name || '.read');

    foreach action_name in array array['insert','update','delete']
    loop
      policy_name := 'dynamic_' || action_name;
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      if action_name = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated
          with check (public.has_permission(%L))',
          policy_name, table_name, table_name || '.create');
      elsif action_name = 'update' then
        execute format('create policy %I on public.%I for update to authenticated
          using (public.has_permission(%L)) with check (public.has_permission(%L))',
          policy_name, table_name, table_name || '.update', table_name || '.update');
      else
        execute format('create policy %I on public.%I for delete to authenticated
          using (public.has_permission(%L))',
          policy_name, table_name, table_name || '.delete');
      end if;
    end loop;
  end loop;
end $$;

drop policy if exists "company_settings_read" on public.company_settings;
drop policy if exists "company_settings_write" on public.company_settings;
create policy "company_settings_read" on public.company_settings for select to authenticated
  using (public.my_role() <> 'pending');
create policy "company_settings_write" on public.company_settings for all to authenticated
  using (public.has_permission('content.manage'))
  with check (public.has_permission('content.manage'));

drop policy if exists "content_pages_read" on public.content_pages;
drop policy if exists "content_pages_write" on public.content_pages;
create policy "content_pages_read" on public.content_pages for select to authenticated
  using (public.my_role() <> 'pending'
    and (published or public.has_permission('content.manage')));
create policy "content_pages_write" on public.content_pages for all to authenticated
  using (public.has_permission('content.manage'))
  with check (public.has_permission('content.manage'));

drop policy if exists "company_assets_editor_upload" on storage.objects;
drop policy if exists "company_assets_editor_update" on storage.objects;
drop policy if exists "company_assets_editor_delete" on storage.objects;
create policy "company_assets_editor_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_permission('content.manage'));
create policy "company_assets_editor_update" on storage.objects for update to authenticated
  using (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_permission('content.manage'))
  with check (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_permission('content.manage'));
create policy "company_assets_editor_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_permission('content.manage'));

notify pgrst, 'reload schema';
