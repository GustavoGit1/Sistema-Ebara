-- This migration only adds storage-layout data and its access policies.
create table if not exists public.storage_layouts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  layout jsonb not null default '{"version":1,"objects":[],"items":[]}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  check (coalesce(jsonb_typeof(layout->'objects') = 'array', false)
    and coalesce(jsonb_typeof(layout->'items') = 'array', false))
);

alter table public.storage_layouts enable row level security;
drop policy if exists storage_layout_company_access on public.storage_layouts;
create policy storage_layout_company_access on public.storage_layouts
for all to authenticated
using (public.is_owner() or public.has_company_access(company_id))
with check (public.is_owner() or public.has_company_access(company_id));
grant select, insert, update, delete on public.storage_layouts to authenticated;

create or replace function public.validate_storage_layout()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item jsonb;
  object jsonb;
  axis text;
begin
  if tg_op = 'UPDATE' and new.revision <> old.revision + 1 then
    raise exception 'A revisão do estoque está desatualizada. Recarregue o layout.';
  end if;
  if new.layout->>'version' is distinct from '1'
    or coalesce(jsonb_typeof(new.layout->'objects'), '') <> 'array'
    or coalesce(jsonb_typeof(new.layout->'items'), '') <> 'array' then
    raise exception 'Formato de layout inválido.';
  end if;
  if (select count(*) from jsonb_array_elements(new.layout->'objects')) <>
    (select count(distinct value->>'id') from jsonb_array_elements(new.layout->'objects')) then
    raise exception 'Identificadores de estruturas inválidos ou repetidos.';
  end if;
  for object in select value from jsonb_array_elements(new.layout->'objects') loop
    foreach axis in array array['width', 'height', 'depth'] loop
      if coalesce(jsonb_typeof(object->'dimensions'->axis), '') <> 'number'
        or (object->'dimensions'->>axis)::numeric <= 0 then
        raise exception 'Dimensões inválidas no estoque.';
      end if;
    end loop;
    if object->>'parentId' is not null and not exists (
      select 1 from jsonb_array_elements(new.layout->'objects') p where p->>'id' = object->>'parentId'
    ) then
      raise exception 'Objeto pai inexistente no estoque.';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(new.layout->'items') loop
    if coalesce(jsonb_typeof(item->'quantity'), '') <> 'number' or (item->>'quantity')::numeric <= 0 then
      raise exception 'Quantidade inválida na posição.';
    end if;
    if not exists (select 1 from public.products p where p.id::text = item->>'productId' and p.company_id = new.company_id) then
      raise exception 'Uma associação contém produto indisponível nesta empresa. Revise as associações.';
    end if;
    if not exists (select 1 from jsonb_array_elements(new.layout->'objects') o where o->>'id' = item->>'locationId') then
      raise exception 'Posição de produto inexistente.';
    end if;
  end loop;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists validate_storage_layout_before_write on public.storage_layouts;
create trigger validate_storage_layout_before_write
before insert or update on public.storage_layouts
for each row execute function public.validate_storage_layout();
