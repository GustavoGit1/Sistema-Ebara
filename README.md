# Sistema Web de Controle de Estoque

Projeto Next.js com JavaScript, Supabase, Tailwind CSS, Recharts e exportacao CSV compativel com Excel, pronto para rodar localmente e publicar na Vercel.

## Requisitos

- Node.js 18 ou superior
- npm
- Conta no Supabase
- Conta no GitHub
- Conta na Vercel

## Estrutura Principal

```text
src/app/page.js                         Tela principal
src/app/api/admin/create-user/route.js  API server-side para criar usuarios
src/components/StockApp.js              Interface, dashboard, produtos, vendas e relatorios
src/lib/supabase.js                     Cliente Supabase do frontend
src/lib/permissions.js                  Regras de permissao do frontend
supabase/schema.sql                     Schema PostgreSQL, triggers, indices e RLS
.env.example                           Exemplo de variaveis de ambiente
```

## 1. Criar Projeto no Supabase

1. Acesse `https://supabase.com`.
2. Clique em `New project`.
3. Escolha a organizacao.
4. Informe nome do projeto, senha do banco e regiao.
5. Aguarde o projeto terminar de ser criado.

## 2. Rodar o SQL no Supabase

1. No painel do Supabase, abra `SQL Editor`.
2. Clique em `New query`.
3. Abra o arquivo `supabase/schema.sql` deste projeto.
4. Copie todo o conteudo.
5. Cole no SQL Editor.
6. Clique em `Run`.

Esse SQL cria tabelas, chaves estrangeiras, indices, triggers de `updated_at`, baixa automatica de estoque, validacao de estoque insuficiente e policies de Row Level Security.

## 3. Pegar URL e Anon Key

1. No Supabase, va em `Project Settings`.
2. Abra `API`.
3. Copie:
   - `Project URL`
   - `anon public`
4. Ainda em `API`, copie tambem a chave `service_role`.

Atencao: `service_role` nunca deve ser usada no frontend. Ela fica apenas em variaveis de ambiente do servidor, como a Vercel.

## 4. Configurar Variaveis Locais

Crie um arquivo `.env.local` na raiz do projeto:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

O arquivo `.env.example` ja esta preparado assim:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## 5. Rodar Localmente

Instale as dependencias:

```bash
npm install
```

Inicie o servidor local:

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

No Windows, se o terminal ainda nao reconhecer `npm` logo depois de instalar o Node.js, rode:

```powershell
.\start-local.ps1
```

## Usuarios Locais de Teste

Para testar a interface sem depender do Supabase, use estes acessos:

```text
Usuario: Master
Senha: Mariah2102#
Empresa: deixe em branco
```

```text
Usuario: Chefe
Senha: 123456
Empresa: empresa1
```

```text
Usuario: Funcionario
Senha: 123456
Empresa: empresa1
```

Esses usuarios funcionam em modo demo local. Os dados criados nesse modo ficam salvos no `localStorage` do navegador.

## 6. Testar Build Local

Antes de publicar, rode:

```bash
npm run build
```

Se o build passar localmente, a chance de passar na Vercel e muito maior.

## 7. Criar Primeiro Usuario Senior

1. No Supabase, va em `Authentication`.
2. Clique em `Add user`.
3. Crie o usuario com e-mail e senha.
4. Copie o `User UID` criado.
5. Va em `SQL Editor`.
6. Rode:

```sql
insert into public.profiles (id, full_name, role)
values ('COLE_AQUI_O_USER_UID', 'Usuario Senior', 'senior');
```

Depois disso, esse usuario podera entrar no sistema e criar owners, managers e employees.

## 8. Subir Para o GitHub

Na raiz do projeto:

```bash
git init
git add .
git commit -m "Initial stock system"
git branch -M main
git remote add origin https://github.com/seu-usuario/seu-repositorio.git
git push -u origin main
```

Nao envie `.env.local` para o GitHub. O `.gitignore` ja bloqueia arquivos `.env`.

## 9. Importar Projeto na Vercel

1. Acesse `https://vercel.com`.
2. Clique em `Add New`.
3. Clique em `Project`.
4. Importe o repositorio do GitHub.
5. Framework: `Next.js`.
6. Build command: `npm run build`.
7. Install command: `npm install`.
8. Output directory: deixe o padrao da Vercel para Next.js.

## 10. Configurar Variaveis na Vercel

Na tela de importacao ou em `Project Settings > Environment Variables`, adicione:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Use os mesmos valores do `.env.local`.

Depois de adicionar as variaveis, faca um novo deploy se o projeto ja tiver sido publicado.

## 11. Fazer Deploy

1. Clique em `Deploy`.
2. Aguarde a Vercel instalar dependencias e rodar `npm run build`.
3. Ao finalizar, abra a URL gerada pela Vercel.
4. Faça login com o usuario senior criado no Supabase.

## Erros Comuns

### Variaveis de Ambiente Faltando

Sintomas:

- Tela nao conecta no Supabase.
- API de criar usuario retorna erro de configuracao.
- Build ou runtime falha na Vercel.

Como resolver:

- Confira `.env.local` localmente.
- Confira `Project Settings > Environment Variables` na Vercel.
- Depois de alterar variaveis na Vercel, rode `Redeploy`.

### Erro de Autenticacao

Sintomas:

- Login falha mesmo com e-mail e senha corretos.
- Usuario existe no Auth, mas nao entra no sistema.

Como resolver:

- Confirme que o usuario existe em `Authentication`.
- Confirme que existe uma linha correspondente em `public.profiles`.
- Confirme que `profiles.id` e igual ao UID do usuario no Auth.
- Confirme que a empresa digitada existe e esta liberada para o usuario.

### Erro de Permissao no Supabase

Sintomas:

- Dados nao aparecem.
- Insert/update retorna erro de RLS.
- Employee nao consegue registrar venda.

Como resolver:

- Confirme que o SQL `supabase/schema.sql` foi executado por completo.
- Verifique se o usuario esta vinculado a empresa em `user_companies`.
- Para owner, confirme que `companies.owner_id` e o UID correto.
- Para manager/employee, confirme `permission_role` em `user_companies`.

### Erro de Build na Vercel

Sintomas:

- Deploy falha em `npm run build`.
- Erro dizendo que pacote nao foi encontrado.

Como resolver:

- Rode `npm install` localmente.
- Rode `npm run build` localmente.
- Confira se `package.json` foi enviado para o GitHub.
- Confira se as variaveis foram adicionadas na Vercel.
- Veja o log completo em `Vercel > Project > Deployments > Failed Deployment`.

## Checklist Final de Publicacao

- [ ] Node.js 18+ instalado localmente.
- [ ] `npm install` executado com sucesso.
- [ ] `.env.local` criado com as 3 variaveis.
- [ ] Projeto Supabase criado.
- [ ] `supabase/schema.sql` executado no SQL Editor.
- [ ] Primeiro usuario senior criado no Supabase Auth.
- [ ] Linha do usuario senior criada em `public.profiles`.
- [ ] `npm run dev` testado localmente.
- [ ] `npm run build` passou localmente.
- [ ] Projeto enviado para GitHub.
- [ ] Projeto importado na Vercel.
- [ ] Variaveis configuradas na Vercel.
- [ ] Deploy concluido.
- [ ] Login do usuario senior testado na URL da Vercel.
