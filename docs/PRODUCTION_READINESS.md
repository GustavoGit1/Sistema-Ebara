# Revisao de Producao, Backup e Recuperacao

Este documento prepara o sistema de estoque para operacao real com Supabase/PostgreSQL, Supabase Storage e deploy em Vercel.

## 1. Politica de backup do Supabase

Segundo a documentacao oficial do Supabase, projetos Pro, Team e Enterprise recebem backups diarios automaticamente no painel `Database > Backups`. O plano Pro acessa os ultimos 7 dias, Team 14 dias e Enterprise ate 30 dias. Projetos Free devem exportar dados regularmente com `supabase db dump` e manter copia fora do Supabase.

Pontos criticos:

- Backups de banco nao incluem arquivos do Supabase Storage, apenas metadados.
- Restaurar backup diario restaura o projeto para aquele ponto e gera indisponibilidade durante o processo.
- PITR, Point-in-Time Recovery, e add-on dos planos pagos e permite granularidade maior que backup diario.
- Se o projeto for excluido, dados e backups associados sao removidos de forma irreversivel.

Recomendacao para producao comercial:

- Usar plano Pro ou superior.
- Habilitar PITR se o RPO aceitavel for menor que 24 horas.
- Manter exportacao externa semanal do banco e diaria dos dados criticos.
- Manter backup separado do bucket `product-images`.

## 2. Rotina de backup

### Backup completo do banco

Usar Supabase CLI:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db dump --linked --file backups/full-$(date +%F).sql
```

Alternativa com `pg_dump`:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=backups/full-$(date +%F).dump
```

### Backup por tabela em CSV

```bash
psql "$DATABASE_URL" -c "\copy public.companies to 'backups/companies.csv' csv header"
psql "$DATABASE_URL" -c "\copy public.profiles to 'backups/profiles.csv' csv header"
psql "$DATABASE_URL" -c "\copy public.user_companies to 'backups/user_companies.csv' csv header"
psql "$DATABASE_URL" -c "\copy public.products to 'backups/products.csv' csv header"
psql "$DATABASE_URL" -c "\copy public.sales to 'backups/sales.csv' csv header"
psql "$DATABASE_URL" -c "\copy public.receipts to 'backups/receipts.csv' csv header"
```

### Exportar apenas uma empresa

Substitua `EMPRESA_UUID`:

```sql
copy (
  select * from public.companies where id = 'EMPRESA_UUID'
) to stdout with csv header;

copy (
  select * from public.profiles
  where company_id = 'EMPRESA_UUID'
     or id in (select user_id from public.user_companies where company_id = 'EMPRESA_UUID')
) to stdout with csv header;

copy (
  select * from public.user_companies where company_id = 'EMPRESA_UUID'
) to stdout with csv header;

copy (
  select * from public.products where company_id = 'EMPRESA_UUID'
) to stdout with csv header;

copy (
  select * from public.sales where company_id = 'EMPRESA_UUID'
) to stdout with csv header;

copy (
  select * from public.receipts where company_id = 'EMPRESA_UUID'
) to stdout with csv header;
```

### Exportar apenas usuarios

```sql
copy (
  select id, username, full_name, role, company_id, active, created_at, updated_at
  from public.profiles
) to stdout with csv header;

copy (
  select * from public.user_companies
) to stdout with csv header;
```

### Exportar apenas produtos

```sql
copy (
  select * from public.products
) to stdout with csv header;
```

### Exportar apenas vendas

```sql
copy (
  select * from public.sales
) to stdout with csv header;

copy (
  select * from public.receipts
) to stdout with csv header;
```

## 3. Restauracao

### Restauracao completa

Opcoes:

- Pelo Dashboard: `Database > Backups > Restore`.
- Pelo PITR: escolher data/hora de recuperacao.
- Por dump proprio:

```bash
pg_restore --clean --if-exists --dbname "$DATABASE_URL" backups/full-YYYY-MM-DD.dump
```

### Restauracao parcial

Procedimento recomendado:

1. Restaurar backup em um projeto Supabase temporario.
2. Exportar somente os dados afetados.
3. Comparar IDs e dependencias.
4. Reimportar no projeto de producao em janela de manutencao.
5. Validar RLS, contagens e integridade.

Nunca restaure parcialmente direto sobre producao sem ensaio em ambiente temporario.

## 4. Plano de Recuperacao

### Perda de dados

1. Congelar operacoes afetadas.
2. Identificar tabela, empresa e intervalo de tempo.
3. Verificar se PITR resolve com menor perda.
4. Se for perda parcial, restaurar em projeto temporario e reimportar apenas registros afetados.

### Exclusao acidental

1. Identificar usuario, empresa, tabela e horario.
2. Verificar logs da aplicacao/Supabase.
3. Restaurar backup em ambiente temporario.
4. Exportar linhas deletadas.
5. Reimportar respeitando ordem: companies, profiles, user_companies, products, sales, receipts.

### Corrupcao de dados

1. Bloquear escrita no escopo afetado.
2. Comparar producao com backup.
3. Corrigir via script transacional.
4. Rodar queries de validacao.

### Restauracao completa

Usar restore do Dashboard ou PITR. Planejar indisponibilidade e comunicar usuarios.

### Restauracao parcial

Usar ambiente temporario. Restaurar somente registros necessarios. Validar relacionamentos e contagens antes de liberar.

## 5. Backup de imagens

O bucket `product-images` e privado. Backups do banco nao restauram objetos deletados do Storage.

### Exportar imagens

Opcoes:

- Criar job Node.js usando service role para listar `product-images` por empresa e baixar objetos.
- Usar Supabase Storage API: listar arquivos por prefixo de empresa e baixar cada objeto.

Estrutura:

```text
product-images/empresa-uuid/produto-uuid/imagem.ext
```

### Restaurar imagens

1. Recriar bucket `product-images`.
2. Reaplicar `supabase/product-images-storage.sql`.
3. Subir arquivos no mesmo caminho original.
4. Confirmar que `products.image_url` aponta para o caminho correto.

### Protecao contra exclusao acidental

- Manter backup externo do bucket.
- Restringir delete pelas policies do Storage.
- Evitar bucket publico.
- Considerar retencao/versionamento externo em S3 se imagens forem criticas.

## 6. Auditoria de performance

### Estado atual

O app carrega em `loadData`:

- todas as empresas acessiveis;
- todos os produtos acessiveis;
- todas as vendas acessiveis;
- todos os usuarios visiveis;
- todos os vinculos visiveis.

Isso funciona para pequeno volume, mas nao escala bem para 50.000 produtos e 300.000 vendas.

### Gargalos provaveis com carga simulada

Com 100 empresas, 500 usuarios, 50.000 produtos, 300.000 vendas e 300.000 recibos:

- `app_sales.select("*").order("created_at", desc)` pode ficar lento e pesado na rede.
- Relatorio de lucro filtra vendas no navegador, o que pode travar com centenas de milhares de linhas.
- Exportacao CSV client-side pode consumir memoria demais.
- Grafico recebe agregado calculado no cliente, mas a materia-prima vem inteira.
- Pesquisa de produtos/empresas/usuarios tambem ocorre no cliente.
- URLs assinadas de imagens sao geradas para todos os produtos carregados que possuem imagem.

### Otimizacoes obrigatorias antes de clientes grandes

1. Paginar produtos, vendas e usuarios no Supabase usando `range`.
2. Criar RPCs ou views agregadas para relatorios por periodo/empresa.
3. Exportar relatorios pelo servidor ou por job assíncrono, nao pelo navegador.
4. Carregar vendas por periodo padrao, por exemplo mes atual.
5. Gerar signed URLs apenas para itens visiveis na pagina atual.
6. Adicionar virtualizacao de tabela se listas passarem de algumas centenas de linhas.
7. Usar filtros no banco para produto, vendedor, comprador, pagamento e empresa.

## 7. Indices revisados

Ja existiam indices para:

- `products.company_id`
- `products.name`
- `sales.company_id`
- `sales.product_id`
- `sales.sold_at`
- `sales.seller_id`
- `sales.buyer_name`
- `companies.owner_id`
- `companies.name`
- `user_companies.company_id`
- `user_companies.user_id`
- `receipts.sale_id`

Foram adicionados em `supabase/performance-indexes.sql`:

- `profiles.role`
- `profiles.active`
- `profiles(role, active)`
- `profiles lower(full_name)`
- `companies.active`
- `companies lower(name)`
- compostos de produtos por empresa/status/nome
- compostos de vendas por empresa/data/produto/vendedor/pagamento/comprador
- `receipts.receipt_number`
- `receipts(company_id, created_at desc)`

## 8. Checklist operacional antes de deploy

- Rodar `supabase/security-hardening.sql`.
- Rodar `supabase/product-images-storage.sql`.
- Rodar `supabase/performance-indexes.sql`.
- Confirmar plano Supabase Pro ou superior.
- Habilitar PITR se o negocio nao aceitar perda de ate 24h.
- Criar rotina externa de backup de Storage.
- Testar restauracao em projeto temporario.
- Testar exportacao por empresa.
- Testar carga com pelo menos 10.000 produtos e 50.000 vendas antes de clientes reais.
