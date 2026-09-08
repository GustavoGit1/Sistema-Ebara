-- Execute no SQL Editor do Supabase para habilitar imagens de produtos.
-- Bucket privado: product-images
-- Estrutura esperada: empresa-uuid/produto-uuid/imagem.ext

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.storage_company_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  company_text text;
begin
  company_text := (storage.foldername(object_name))[1];
  return company_text::uuid;
exception
  when others then
    return null;
end;
$$;

drop policy if exists "product_images_select_by_company" on storage.objects;
drop policy if exists "product_images_insert_by_company" on storage.objects;
drop policy if exists "product_images_update_by_company" on storage.objects;
drop policy if exists "product_images_delete_by_company" on storage.objects;

create policy "product_images_select_by_company"
on storage.objects for select
to authenticated
using (
  bucket_id = 'product-images'
  and public.has_company_access(public.storage_company_id(name))
);

create policy "product_images_insert_by_company"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.has_company_management_access(public.storage_company_id(name))
  and lower((storage.extension(name))) in ('jpg', 'jpeg', 'png', 'webp')
);

create policy "product_images_update_by_company"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and public.has_company_management_access(public.storage_company_id(name))
)
with check (
  bucket_id = 'product-images'
  and public.has_company_management_access(public.storage_company_id(name))
  and lower((storage.extension(name))) in ('jpg', 'jpeg', 'png', 'webp')
);

create policy "product_images_delete_by_company"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and public.has_company_management_access(public.storage_company_id(name))
);
