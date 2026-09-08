-- Hardening de seguranca antes de deploy.
-- Execute no SQL Editor do Supabase.

-- 1) Impede que usuario comum altere o proprio profile e eleve role/company_id.
drop policy if exists "profiles_update_self_or_owner" on public.profiles;
drop policy if exists "profiles_update_self_or_senior" on public.profiles;

create policy "profiles_update_owner"
on public.profiles for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

-- 2) Gestores podem editar dados cadastrais da empresa, mas nao owner_id/active via payload adulterado.
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

-- 3) Gestor nao pode mover produto entre empresas por payload adulterado.
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

-- 4) Garante grants minimos esperados para recibos e pagamento.
revoke update on public.sales from authenticated;
grant update (payment_status) on public.sales to authenticated;
grant select on public.receipts to authenticated;
grant execute on function public.ensure_sale_receipt(uuid) to authenticated;
