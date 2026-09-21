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
  new.sold_by = coalesce(new.sold_by, auth.uid());
  new.sold_at = coalesce(new.sold_at, now());

  update public.products
  set quantity = quantity - new.quantity
  where id = new.product_id;

  return new;
end;
$$;

create or replace function public.can_see_purchase_price()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('owner', 'manager'), false)
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
on public.profiles for select
to authenticated
using (public.can_view_profile(id));

drop policy if exists "companies_select_by_role" on public.companies;
create policy "companies_select_by_role"
on public.companies for select
to authenticated
using (
  public.is_owner()
  or public.has_company_access(id)
);

drop policy if exists "companies_update_owner" on public.companies;
create policy "companies_update_owner"
on public.companies for update
to authenticated
using (
  public.is_owner()
  or public.has_company_management_access(id)
)
with check (
  public.is_owner()
  or public.has_company_management_access(id)
);

drop policy if exists "user_companies_select_by_role" on public.user_companies;
create policy "user_companies_select_by_role"
on public.user_companies for select
to authenticated
using (
  public.is_owner()
  or user_id = auth.uid()
  or public.has_company_access(company_id)
);

drop policy if exists "products_select_linked_companies" on public.products;
create policy "products_select_linked_companies"
on public.products for select
to authenticated
using (
  public.is_owner()
  or public.has_company_access(company_id)
);
