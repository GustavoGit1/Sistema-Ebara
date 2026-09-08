create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  full_name text,
  role text not null check (role in ('owner', 'manager', 'employee')),
  company_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  address text,
  document text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists username text,
  add column if not exists company_id uuid,
  add column if not exists active boolean not null default true;

alter table public.companies
  alter column owner_id drop not null,
  add column if not exists document text,
  add column if not exists phone text,
  add column if not exists notes text,
  add column if not exists active boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_company_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('owner', 'manager', 'employee'));
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_company_required'
  ) then
    alter table public.profiles
      add constraint profiles_company_required
      check (company_id is not null) not valid;
  end if;
end $$;

create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.user_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  permission_role text not null check (permission_role in ('owner', 'manager', 'employee')),
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  image_url text,
  stock_position text,
  sale_price numeric(12,2) not null check (sale_price >= 0),
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  quantity integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists active boolean not null default true,
  add column if not exists stock_position text;

alter table public.products
  drop constraint if exists products_quantity_check;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  seller_id uuid references public.profiles(id) on delete set null,
  seller_name text,
  buyer_name text,
  payment_status text not null default 'unpaid' check (payment_status in ('paid', 'partial', 'unpaid')),
  stock_exceeded boolean not null default false,
  sold_by uuid references public.profiles(id) on delete set null default auth.uid(),
  quantity integer not null check (quantity > 0),
  sale_price numeric(12,2) not null check (sale_price >= 0),
  purchase_price_at_sale numeric(12,2) not null default 0,
  total_sale numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  profit numeric(12,2) not null default 0,
  sold_at timestamptz not null default now()
);

alter table public.sales
  add column if not exists seller_id uuid references public.profiles(id) on delete set null,
  add column if not exists buyer_name text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists stock_exceeded boolean not null default false;

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

create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_profiles_username on public.profiles using gin (to_tsvector('simple', coalesce(username, '')));
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_active on public.profiles(active);
create index if not exists idx_profiles_role_active on public.profiles(role, active);
create index if not exists idx_profiles_full_name_lower on public.profiles(lower(full_name));
create index if not exists idx_companies_owner_id on public.companies(owner_id);
create index if not exists idx_companies_name on public.companies using gin (to_tsvector('simple', name));
create index if not exists idx_companies_active on public.companies(active);
create index if not exists idx_companies_name_lower on public.companies(lower(name));
create index if not exists idx_user_companies_user_id on public.user_companies(user_id);
create index if not exists idx_user_companies_company_id on public.user_companies(company_id);
create index if not exists idx_products_company_id on public.products(company_id);
create index if not exists idx_products_name on public.products using gin (to_tsvector('simple', name));
create index if not exists idx_products_created_by on public.products(created_by);
create index if not exists idx_products_company_active on public.products(company_id, active);
create index if not exists idx_products_company_name_lower on public.products(company_id, lower(name));
create index if not exists idx_products_company_updated_at on public.products(company_id, updated_at desc);
create index if not exists idx_sales_product_id on public.sales(product_id);
create index if not exists idx_sales_company_id on public.sales(company_id);
create index if not exists idx_sales_sold_at on public.sales(sold_at);
create index if not exists idx_sales_seller_id on public.sales(seller_id);
create index if not exists idx_sales_seller_name on public.sales using gin (to_tsvector('simple', coalesce(seller_name, '')));
create index if not exists idx_sales_sold_by on public.sales(sold_by);
create index if not exists idx_sales_buyer_name on public.sales using gin (to_tsvector('simple', coalesce(buyer_name, '')));
create index if not exists idx_sales_payment_status on public.sales(payment_status);
create index if not exists idx_sales_company_sold_at_desc on public.sales(company_id, sold_at desc);
create index if not exists idx_sales_company_product on public.sales(company_id, product_id);
create index if not exists idx_sales_company_seller on public.sales(company_id, seller_id);
create index if not exists idx_sales_company_payment on public.sales(company_id, payment_status);
create index if not exists idx_sales_company_buyer_lower on public.sales(company_id, lower(buyer_name));
create index if not exists idx_sales_sold_by_sold_at_desc on public.sales(sold_by, sold_at desc);

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

create sequence if not exists public.receipt_number_seq;

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
create index if not exists idx_receipts_receipt_number on public.receipts(receipt_number);
create index if not exists idx_receipts_company_created_at on public.receipts(company_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'owner', false)
$$;

create or replace function public.has_company_access(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = target_company_id
      and c.active = true
      and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active = true)
      and (
        public.is_owner()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.company_id = target_company_id
        )
        or exists (
          select 1
          from public.user_companies uc
          where uc.company_id = target_company_id
            and uc.user_id = auth.uid()
        )
      )
  )
$$;

create or replace function public.has_company_management_access(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = target_company_id
      and c.active = true
      and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active = true)
      and (
        public.is_owner()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.company_id = target_company_id
            and p.role = 'manager'
        )
        or exists (
          select 1
          from public.user_companies uc
          where uc.company_id = target_company_id
            and uc.user_id = auth.uid()
            and uc.permission_role in ('owner', 'manager')
        )
      )
  )
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
    raise exception 'Produto nÃ£o encontrado';
  end if;

  if product_record.active = false then
    raise exception 'Produto inativo nÃ£o pode ser vendido';
  end if;

  if product_record.company_id <> new.company_id then
    raise exception 'Produto nÃ£o pertence Ã  empresa informada';
  end if;

  if not exists (select 1 from public.companies where id = new.company_id and active = true) then
    raise exception 'Empresa inativa nÃ£o permite venda';
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
    raise exception 'Vendedor inativo ou nÃ£o encontrado';
  end if;

  if seller_record.role <> 'owner'
    and seller_record.company_id <> new.company_id
    and not exists (
      select 1
      from public.user_companies uc
      where uc.user_id = seller_record.id
        and uc.company_id = new.company_id
    ) then
    raise exception 'Vendedor nÃ£o pertence Ã  empresa da venda';
  end if;

  if new.quantity <= 0 then
    raise exception 'Quantidade vendida deve ser maior que zero';
  end if;

  new.stock_exceeded = coalesce(new.stock_exceeded, false) or product_record.quantity < new.quantity;

  new.purchase_price_at_sale = case
    when new.stock_exceeded then new.sale_price * 2
    else coalesce(product_record.purchase_price, 0)
  end;
  new.total_sale = new.sale_price * new.quantity;
  new.total_cost = new.purchase_price_at_sale * new.quantity;
  new.profit = case
    when new.stock_exceeded then -new.total_sale
    else new.total_sale - new.total_cost
  end;
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

drop trigger if exists trg_sales_prepare_and_decrease_stock on public.sales;
create trigger trg_sales_prepare_and_decrease_stock
before insert on public.sales
for each row execute function public.prepare_sale_and_decrease_stock();

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

create or replace function public.prevent_company_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner()
    and (
      new.owner_id is distinct from old.owner_id
      or new.active is distinct from old.active
    ) then
    raise exception 'Sem permissao para alterar campos sensiveis da empresa';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_companies_prevent_sensitive_update on public.companies;
create trigger trg_companies_prevent_sensitive_update
before update on public.companies
for each row execute function public.prevent_company_sensitive_update();

create or replace function public.prevent_product_company_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner()
    and new.company_id is distinct from old.company_id then
    raise exception 'Sem permissao para alterar a empresa do produto';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_prevent_company_change on public.products;
create trigger trg_products_prevent_company_change
before update on public.products
for each row execute function public.prevent_product_company_change();

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.user_companies enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.undelivered_products enable row level security;
alter table public.receipts enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert_owner" on public.profiles;
drop policy if exists "profiles_insert_senior" on public.profiles;
drop policy if exists "profiles_update_self_or_owner" on public.profiles;
drop policy if exists "profiles_update_self_or_senior" on public.profiles;
drop policy if exists "profiles_delete_owner" on public.profiles;

create policy "profiles_select"
on public.profiles for select
to authenticated
using (
  public.can_view_profile(id)
);

create policy "profiles_insert_owner"
on public.profiles for insert
to authenticated
with check (public.is_owner());

create policy "profiles_update_self_or_owner"
on public.profiles for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

create policy "profiles_delete_owner"
on public.profiles for delete
to authenticated
using (public.is_owner());

drop policy if exists "companies_select_by_role" on public.companies;
drop policy if exists "companies_insert_owner_or_senior" on public.companies;
drop policy if exists "companies_update_owner_or_senior" on public.companies;
drop policy if exists "companies_delete_owner_or_senior" on public.companies;

create policy "companies_select_by_role"
on public.companies for select
to authenticated
using (
  public.is_owner()
  or public.has_company_access(id)
);

create policy "companies_insert_owner"
on public.companies for insert
to authenticated
with check (public.is_owner());

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

create policy "companies_delete_owner"
on public.companies for delete
to authenticated
using (public.is_owner());

drop policy if exists "user_companies_select_by_role" on public.user_companies;
drop policy if exists "user_companies_insert_owner_or_senior" on public.user_companies;
drop policy if exists "user_companies_update_owner_or_senior" on public.user_companies;
drop policy if exists "user_companies_delete_owner_or_senior" on public.user_companies;

create policy "user_companies_select_by_role"
on public.user_companies for select
to authenticated
using (
  public.is_owner()
  or user_id = auth.uid()
  or public.has_company_access(company_id)
);

create policy "user_companies_insert_owner"
on public.user_companies for insert
to authenticated
with check (public.is_owner());

create policy "user_companies_update_owner"
on public.user_companies for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

create policy "user_companies_delete_owner"
on public.user_companies for delete
to authenticated
using (public.is_owner());

drop policy if exists "products_select_linked_companies" on public.products;
drop policy if exists "products_insert_manager_owner_senior" on public.products;
drop policy if exists "products_update_manager_owner_senior" on public.products;
drop policy if exists "products_delete_manager_owner_senior" on public.products;

create policy "products_select_linked_companies"
on public.products for select
to authenticated
using (
  public.is_owner()
  or public.has_company_access(company_id)
);

create policy "products_insert_manager_owner"
on public.products for insert
to authenticated
with check (public.has_company_management_access(company_id));

create policy "products_update_manager_owner"
on public.products for update
to authenticated
using (public.has_company_management_access(company_id))
with check (public.has_company_management_access(company_id));

create policy "products_delete_owner"
on public.products for delete
to authenticated
using (public.is_owner());

drop policy if exists "sales_select_linked_companies" on public.sales;
drop policy if exists "sales_insert_linked_companies" on public.sales;
drop policy if exists "sales_update_owner_or_senior" on public.sales;
drop policy if exists "sales_update_owner" on public.sales;
drop policy if exists "sales_update_linked_companies" on public.sales;
drop policy if exists "sales_delete_owner_or_senior" on public.sales;

create policy "sales_select_linked_companies"
on public.sales for select
to authenticated
using (public.has_company_access(company_id));

create policy "sales_insert_linked_companies"
on public.sales for insert
to authenticated
with check (
  public.has_company_access(company_id)
  and coalesce(sold_by, auth.uid()) = auth.uid()
);

create policy "sales_update_linked_companies"
on public.sales for update
to authenticated
using (public.has_company_access(company_id))
with check (public.has_company_access(company_id));

create policy "sales_delete_owner"
on public.sales for delete
to authenticated
using (public.is_owner());

drop policy if exists "receipts_select_linked_companies" on public.receipts;
drop policy if exists "receipts_insert_service" on public.receipts;

create policy "receipts_select_linked_companies"
on public.receipts for select
to authenticated
using (public.has_company_access(company_id));

create or replace function public.can_see_purchase_price()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('owner', 'manager'), false)
$$;

create or replace view public.app_products
with (security_invoker = true)
as
select
  p.id,
  p.company_id,
  c.name as company_name,
  p.name,
  p.image_url,
  p.stock_position,
  p.sale_price,
  case when public.can_see_purchase_price() then p.purchase_price else null end as purchase_price,
  p.quantity,
  p.active,
  p.created_by,
  p.created_at,
  p.updated_at
from public.products p
join public.companies c on c.id = p.company_id;

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
  s.stock_exceeded,
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

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.user_companies to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, delete on public.sales to authenticated;
grant update (payment_status) on public.sales to authenticated;
grant select, insert, update, delete on public.undelivered_products to authenticated;
grant select on public.receipts to authenticated;
grant execute on function public.ensure_sale_receipt(uuid) to authenticated;
grant select on public.app_products to authenticated;
grant select on public.app_sales to authenticated;
grant select on public.app_undelivered_products to authenticated;




