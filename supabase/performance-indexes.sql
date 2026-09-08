-- Indices de performance para producao.
-- Execute no SQL Editor do Supabase.

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_active on public.profiles(active);
create index if not exists idx_profiles_role_active on public.profiles(role, active);
create index if not exists idx_profiles_full_name_lower on public.profiles(lower(full_name));

create index if not exists idx_companies_active on public.companies(active);
create index if not exists idx_companies_name_lower on public.companies(lower(name));

create index if not exists idx_products_company_active on public.products(company_id, active);
create index if not exists idx_products_company_name_lower on public.products(company_id, lower(name));
create index if not exists idx_products_company_updated_at on public.products(company_id, updated_at desc);

create index if not exists idx_sales_company_sold_at_desc on public.sales(company_id, sold_at desc);
create index if not exists idx_sales_company_product on public.sales(company_id, product_id);
create index if not exists idx_sales_company_seller on public.sales(company_id, seller_id);
create index if not exists idx_sales_company_payment on public.sales(company_id, payment_status);
create index if not exists idx_sales_company_buyer_lower on public.sales(company_id, lower(buyer_name));
create index if not exists idx_sales_sold_by_sold_at_desc on public.sales(sold_by, sold_at desc);

create index if not exists idx_receipts_receipt_number on public.receipts(receipt_number);
create index if not exists idx_receipts_company_created_at on public.receipts(company_id, created_at desc);

-- Mantem estatisticas atualizadas apos criacao de indices.
analyze public.profiles;
analyze public.companies;
analyze public.user_companies;
analyze public.products;
analyze public.sales;
analyze public.receipts;
