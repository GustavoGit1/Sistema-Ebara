alter table public.products
  add column if not exists stock_position text;

drop view if exists public.app_products;
create view public.app_products
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

grant select on public.app_products to authenticated;
