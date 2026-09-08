-- Reset production/demo operational data before deploy while preserving users and access links.
-- Execute in the Supabase SQL Editor as a project owner.
-- Preserved tables: auth.users, public.profiles, public.companies, public.user_companies.

begin;

truncate table public.receipts restart identity cascade;
truncate table public.sales restart identity cascade;
truncate table public.undelivered_products restart identity cascade;
truncate table public.products restart identity cascade;

delete from storage.objects
where bucket_id = 'product-images';

commit;

-- Optional verification after commit:
-- select 'products' as table_name, count(*) from public.products
-- union all select 'sales', count(*) from public.sales
-- union all select 'receipts', count(*) from public.receipts
-- union all select 'undelivered_products', count(*) from public.undelivered_products
-- union all select 'profiles_preserved', count(*) from public.profiles
-- union all select 'companies_preserved', count(*) from public.companies
-- union all select 'user_company_links_preserved', count(*) from public.user_companies;