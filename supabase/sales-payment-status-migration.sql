-- Execute este arquivo no SQL Editor do Supabase para adicionar e padronizar
-- Comprador e Status de Pagamento nas vendas.

alter table public.sales
  add column if not exists buyer_name text,
  add column if not exists payment_status text not null default 'unpaid';

update public.sales
set payment_status = 'unpaid'
where payment_status is null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'sales'
      and constraint_name = 'sales_payment_status_check'
  ) then
    alter table public.sales drop constraint sales_payment_status_check;
  end if;

  alter table public.sales
    add constraint sales_payment_status_check
    check (payment_status in ('paid', 'partial', 'unpaid'));
end $$;

create index if not exists idx_sales_buyer_name
  on public.sales using gin (to_tsvector('simple', coalesce(buyer_name, '')));

create index if not exists idx_sales_payment_status
  on public.sales(payment_status);

create or replace function public.prepare_sale_and_decrease_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_record public.products%rowtype;
  seller_record public.profiles%rowtype;
begin
  select *
    into product_record
  from public.products
  where id = new.product_id
  for update;

  if product_record.id is null then
    raise exception 'Produto nao encontrado';
  end if;

  if product_record.active = false then
    raise exception 'Produto inativo nao pode ser vendido';
  end if;

  if product_record.company_id <> new.company_id then
    raise exception 'Produto nao pertence a empresa informada';
  end if;

  if not exists (select 1 from public.companies where id = new.company_id and active = true) then
    raise exception 'Empresa inativa nao permite venda';
  end if;

  if new.seller_id is null then
    raise exception 'Vendedor vinculado ao usuario e obrigatorio';
  end if;

  if nullif(btrim(coalesce(new.buyer_name, '')), '') is null then
    raise exception 'Comprador e obrigatorio';
  end if;

  if new.payment_status is null or new.payment_status not in ('paid', 'partial', 'unpaid') then
    raise exception 'Status de pagamento invalido';
  end if;

  select *
    into seller_record
  from public.profiles
  where id = new.seller_id;

  if seller_record.id is null or seller_record.active = false then
    raise exception 'Vendedor inativo ou nao encontrado';
  end if;

  if seller_record.role <> 'owner'
    and seller_record.company_id <> new.company_id
    and not exists (
      select 1
      from public.user_companies uc
      where uc.user_id = seller_record.id
        and uc.company_id = new.company_id
    ) then
    raise exception 'Vendedor nao pertence a empresa da venda';
  end if;

  if new.quantity <= 0 then
    raise exception 'Quantidade vendida deve ser maior que zero';
  end if;

  if product_record.quantity < new.quantity then
    raise exception 'Estoque insuficiente. Disponivel: %, solicitado: %', product_record.quantity, new.quantity;
  end if;

  new.purchase_price_at_sale = coalesce(product_record.purchase_price, 0);
  new.total_sale = new.sale_price * new.quantity;
  new.total_cost = coalesce(product_record.purchase_price, 0) * new.quantity;
  new.profit = new.total_sale - new.total_cost;
  new.seller_name = coalesce(nullif(new.seller_name, ''), seller_record.full_name, seller_record.username);
  new.buyer_name = btrim(new.buyer_name);
  new.sold_by = coalesce(new.sold_by, auth.uid());
  new.sold_at = coalesce(new.sold_at, now());

  update public.products
  set quantity = quantity - new.quantity
  where id = new.product_id;

  return new;
end;
$$;

drop policy if exists "sales_update_owner_or_senior" on public.sales;
drop policy if exists "sales_update_owner" on public.sales;
drop policy if exists "sales_update_linked_companies" on public.sales;

create policy "sales_update_linked_companies"
on public.sales for update
to authenticated
using (public.has_company_access(company_id))
with check (public.has_company_access(company_id));

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

revoke update on public.sales from authenticated;
grant update (payment_status) on public.sales to authenticated;
grant select on public.app_sales to authenticated;
