-- Execute somente se o Chefe existir no Supabase, mas estiver com role/vinculo incorretos.
-- Este SQL nao altera senha do Supabase Auth. Para senha, ajuste o usuario no painel Auth
-- ou edite pelo sistema como Administrador do Sistema.

with target_company as (
  select id
  from public.companies
  where lower(trim(name)) = 'empresa1'
  limit 1
),
target_profile as (
  update public.profiles p
  set
    role = 'manager',
    company_id = (select id from target_company),
    active = true,
    updated_at = now()
  where lower(trim(coalesce(nullif(p.username, ''), p.full_name))) = 'chefe'
  returning p.id, p.role
)
insert into public.user_companies (user_id, company_id, permission_role)
select target_profile.id, target_company.id, 'manager'
from target_profile, target_company
on conflict (user_id, company_id)
do update set permission_role = excluded.permission_role;

update public.companies
set active = true,
    updated_at = now()
where lower(trim(name)) = 'empresa1';
