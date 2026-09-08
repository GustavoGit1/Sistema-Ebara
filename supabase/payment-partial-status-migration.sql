-- Allow sales and undelivered products to be marked as partially paid.

alter table public.sales
  drop constraint if exists sales_payment_status_check;

alter table public.sales
  add constraint sales_payment_status_check
  check (payment_status in ('paid', 'partial', 'unpaid'));

alter table public.undelivered_products
  drop constraint if exists undelivered_products_payment_status_check;

alter table public.undelivered_products
  add constraint undelivered_products_payment_status_check
  check (payment_status in ('paid', 'partial', 'unpaid'));