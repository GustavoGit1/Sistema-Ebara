-- Execute este arquivo no SQL Editor do Supabase para corrigir o acesso de
-- Funcionarios e adicionar o Comprador nas vendas existentes.

alter table public.sales
  add column if not exists buyer_name text,
  add column if not exists payment_status text not null default 'unpaid';

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'owner', false)
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    target_user_id = auth.uid()
    or public.current_user_role() = 'owner'
    or (
      public.current_user_role() = 'manager'
      and exists (
        select 1
        from public.profiles target
        where target.id = target_user_id
          and (
            public.has_company_management_access(target.company_id)
            or exists (
              select 1
              from public.user_companies target_link
              where target_link.user_id = target.id
                and public.has_company_management_access(target_link.company_id)
            )
          )
      )
    ),
    false
  )
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
on public.profiles for select
to authenticated
using (public.can_view_profile(id));

drop view if exists public.app_sales;
create view public.app_sales
with (security_invoker = true)
as
select
  s.id,
  s.product_id,
  s.company_id,
  p.name as product_name,
  c.name as company_name,
  s.seller_id,
  coalesce(sp.full_name, sp.username, s.seller_name) as seller_name,
  s.buyer_name,
  s.payment_status,
  s.sold_by,
  s.quantity,
  s.sale_price,
  case when public.can_see_purchase_price() then s.purchase_price_at_sale else 0 end as purchase_price_snapshot,
  s.total_sale,
  case when public.can_see_purchase_price() then s.total_cost else 0 end as total_cost,
  case when public.can_see_purchase_price() then s.profit else 0 end as profit,
  s.sold_at as created_at,
  s.sold_at
from public.sales s
join public.products p on p.id = s.product_id
join public.companies c on c.id = s.company_id
left join public.profiles sp on sp.id = s.seller_id;

grant select on public.app_sales to authenticated;
