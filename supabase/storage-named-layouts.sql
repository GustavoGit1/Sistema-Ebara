-- Execute after storage-layouts.sql. Existing company layouts remain available.
create table if not exists public.storage_named_layouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  layout jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create unique index if not exists storage_named_layouts_company_name
  on public.storage_named_layouts(company_id, lower(btrim(name)));
alter table public.storage_named_layouts enable row level security;
drop policy if exists storage_named_layout_company_access on public.storage_named_layouts;
create policy storage_named_layout_company_access on public.storage_named_layouts
for all to authenticated
using (public.is_owner() or public.has_company_access(company_id))
with check (public.is_owner() or public.has_company_access(company_id));
grant select, insert, update, delete on public.storage_named_layouts to authenticated;
drop trigger if exists validate_storage_named_layout_before_write on public.storage_named_layouts;
create trigger validate_storage_named_layout_before_write
before insert or update on public.storage_named_layouts
for each row execute function public.validate_storage_layout();
