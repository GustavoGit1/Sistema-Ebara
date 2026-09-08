create table if not exists public.undelivered_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_name text not null,
  location text not null,
  seller_name text not null,
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('paid', 'partial', 'unpaid')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_undelivered_products_company_id on public.undelivered_products(company_id);
create index if not exists idx_undelivered_products_created_at on public.undelivered_products(created_at desc);
create index if not exists idx_undelivered_products_payment_status on public.undelivered_products(payment_status);

alter table public.undelivered_products enable row level security;

drop policy if exists "undelivered_select_linked_companies" on public.undelivered_products;
drop policy if exists "undelivered_insert_linked_companies" on public.undelivered_products;
drop policy if exists "undelivered_update_linked_companies" on public.undelivered_products;
drop policy if exists "undelivered_delete_owner" on public.undelivered_products;

create policy "undelivered_select_linked_companies"
on public.undelivered_products for select
using (public.is_owner() or public.has_company_access(company_id));

create policy "undelivered_insert_linked_companies"
on public.undelivered_products for insert
with check (public.is_owner() or public.has_company_access(company_id));

create policy "undelivered_update_linked_companies"
on public.undelivered_products for update
using (public.is_owner() or public.has_company_access(company_id))
with check (public.is_owner() or public.has_company_access(company_id));

create policy "undelivered_delete_owner"
on public.undelivered_products for delete
using (public.is_owner());

drop view if exists public.app_undelivered_products;
create view public.app_undelivered_products
with (security_invoker = true)
as
select
  up.id,
  up.company_id,
  c.name as company_name,
  up.product_name,
  up.location,
  up.seller_name,
  up.sale_price,
  up.payment_status,
  up.created_by,
  coalesce(p.full_name, p.username) as created_by_name,
  up.created_at
from public.undelivered_products up
join public.companies c on c.id = up.company_id
left join public.profiles p on p.id = up.created_by;

grant select, insert, update, delete on public.undelivered_products to authenticated;
grant select on public.app_undelivered_products to authenticated;
