-- Execute este arquivo no SQL Editor do Supabase para criar Recibos de Venda.
-- Recibo interno/comprovante de venda. Nao e nota fiscal oficial.

create sequence if not exists public.receipt_number_seq;

alter table public.sales
  add column if not exists buyer_name text,
  add column if not exists payment_status text not null default 'unpaid';

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

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete cascade,
  receipt_number text not null unique default ('REC-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0')),
  company_id uuid not null references public.companies(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_receipts_sale_id on public.receipts(sale_id);
create index if not exists idx_receipts_company_id on public.receipts(company_id);
create index if not exists idx_receipts_created_by on public.receipts(created_by);

create or replace function public.create_receipt_for_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.receipts (sale_id, company_id, created_by)
  values (new.id, new.company_id, coalesce(new.sold_by, auth.uid()))
  on conflict (sale_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_sales_create_receipt on public.sales;
create trigger trg_sales_create_receipt
after insert on public.sales
for each row execute function public.create_receipt_for_sale();

create or replace function public.ensure_sale_receipt(target_sale_id uuid)
returns public.receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  sale_record public.sales%rowtype;
  receipt_record public.receipts%rowtype;
begin
  select *
    into sale_record
  from public.sales
  where id = target_sale_id;

  if sale_record.id is null then
    raise exception 'Venda nao encontrada';
  end if;

  if not public.has_company_access(sale_record.company_id) then
    raise exception 'Acesso negado ao recibo';
  end if;

  insert into public.receipts (sale_id, company_id, created_by)
  values (sale_record.id, sale_record.company_id, coalesce(sale_record.sold_by, auth.uid()))
  on conflict (sale_id) do update
    set sale_id = excluded.sale_id
  returning * into receipt_record;

  return receipt_record;
end;
$$;

alter table public.receipts enable row level security;

drop policy if exists "receipts_select_linked_companies" on public.receipts;
drop policy if exists "receipts_insert_service" on public.receipts;

create policy "receipts_select_linked_companies"
on public.receipts for select
to authenticated
using (public.has_company_access(company_id));

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
  c.address as company_address,
  s.seller_id,
  coalesce(sp.full_name, sp.username, s.seller_name) as seller_name,
  s.buyer_name,
  s.payment_status,
  s.sold_by,
  coalesce(cp.full_name, cp.username) as created_by_name,
  r.id as receipt_id,
  r.receipt_number,
  r.created_at as receipt_created_at,
  r.created_by as receipt_created_by,
  coalesce(rp.full_name, rp.username) as receipt_created_by_name,
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
left join public.profiles sp on sp.id = s.seller_id
left join public.profiles cp on cp.id = s.sold_by
left join public.receipts r on r.sale_id = s.id
left join public.profiles rp on rp.id = r.created_by;

grant select on public.receipts to authenticated;
grant execute on function public.ensure_sale_receipt(uuid) to authenticated;
grant select on public.app_sales to authenticated;
