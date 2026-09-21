# Estoque 3D e sugestão de espaço

As duas opções aparecem na página inicial de administrador, gestor e funcionário. A seleção de empresa respeita as empresas disponíveis para o usuário. A implementação mantém React/JavaScript, Tailwind, Next.js e Supabase do projeto; Three.js é carregado somente quando a tela 3D abre.

## Ativação

1. Instale as dependências com `npm.cmd ci`.
2. No ambiente Supabase já configurado, execute `supabase/storage-layouts.sql` após as migrações existentes de permissões. A migração acrescenta uma tabela, políticas e validações de revisão, dimensões e produtos da mesma empresa; não modifica as tabelas operacionais.
3. Execute `npm.cmd run build` e inicie a aplicação como de costume.

A migração não foi executada remotamente nesta implementação. As configurações do Supabase estão ausentes neste ambiente. Ela foi executada duas vezes, com sucesso, em PostgreSQL local isolado para testar repetibilidade, validações e políticas com funções de autorização de teste. Sem a nova tabela, o modo conectado apresenta um erro de carregamento e não cria um layout local silenciosamente.

No login de demonstração existente, o salvamento usa IndexedDB, separado por empresa. Esses dados ficam somente naquele navegador. Nos logins conectados, o layout é compartilhado via Supabase, com RLS por empresa e controle de revisão para impedir sobrescrita concorrente.

## Uso

- **Localizar:** pesquise parte do nome, SKU, código ou ID existente; escolha o produto e uma de suas posições. A câmera percorre a hierarquia e destaca o destino. Uma lista de objetos também permite navegar sem depender exclusivamente do desenho.
- **Montar:** ative Editar estoque, adicione objetos, arraste para mover e use Girar ou os campos de dimensão. O número de prateleiras atualiza a geometria. As subdivisões recebem códigos hierárquicos. Duplicar copia a estrutura, preservando o estoque associado somente ao original.
- **Associar:** selecione uma posição, caixa, palete ou gaveta sem subdivisões, escolha um produto e informe a quantidade. As três medidas opcionais representam o volume total armazenado, não as dimensões de uma unidade.
- **Sugestão:** informe as medidas totais do material a guardar. Posições vazias compatíveis têm prioridade. Espaços ocupados sem volume cadastrado e subdivisões de um objeto ocupado são excluídos. Toque numa sugestão para vê-la no ambiente.
- **Salvar:** as alterações são salvas automaticamente, agrupando a digitação. Desfazer/refazer mantém até 50 etapas durante a sessão. Ao fechar com alterações pendentes, o sistema pede confirmação. É possível exportar e importar uma cópia JSON; importar valida a estrutura e os produtos da empresa antes de substituir o layout. Conflitos entre abas ou usuários não sobrescrevem a versão mais recente.

## Arquitetura

- `src/lib/storage-layout.js`: modelo genérico, hierarquia, duplicação, cálculo de espaço e persistência local.
- `src/components/StorageScene.js`: integração React do renderer.
- `src/lib/storage-scene-engine.js`: câmera, geometria procedural, guias de encaixe e detalhes por distância; não acessa o banco. Compartilha geometrias e materiais, limita os rótulos visíveis e evita redesenhar quando a câmera está parada.
- `src/lib/storage-operations.js`: validação de hierarquia, dimensões, redimensionamento de subdivisões e encaixe com rotação.
- `src/lib/storage-persistence.js`: repositório local/remoto e fila de salvamento.
- `src/components/StorageWorkspace.js`: fluxos de consulta/montagem, sugestões, histórico e persistência conectada.
- `supabase/storage-layouts.sql`: persistência por empresa; usa `is_owner()` e `has_company_access()` existentes.

Posições e rotações são locais ao objeto pai; dimensões são guardadas em metros. A hierarquia não exige corredores, gôndolas ou prateleiras. O campo `properties` permite ampliar o catálogo e guardar metadados de orientação futura.

## Limites desta versão

- A sugestão é uma estimativa geométrica, não uma reserva de espaço. Não simula empilhamento, peso, obstáculos ou fragmentação do volume livre. A disposição física precisa ser confirmada no local.
- Vendas e ajustes existentes não registram a posição de retirada. Por isso, não alteram automaticamente a distribuição física; a tela avisa quando a soma das posições diverge do saldo do produto. Atualize as associações após essas movimentações.
- A imagem do produto é opcional. SKU e código são pesquisados quando presentes nos dados recebidos; o cadastro de produtos existente permanece inalterado.
- O renderer usa geometrias e materiais compartilhados, frustum culling, resolução limitada e detalhes por distância; carrega até 48 rótulos próximos por vez. Foram exercitadas 500 posições numa cena de 610 objetos. Ainda é necessário medir desempenho em tablets físicos; não foi implementado instancing nem navegação indoor.
- A migração e as políticas RLS precisam de validação no Supabase real antes da publicação. Os testes de navegador usaram exclusivamente o modo demonstração.

## Validação

`node --test docs/storage-layout.test.mjs docs/storage-operations.test.mjs` executa 14 testes de hierarquia, redimensionamento, dimensões inválidas, duplicação, sugestões, snap com rotação, fila de salvamento e conflito de revisão.

Para reproduzir os testes opcionais sem modificar as dependências da aplicação:

`npm.cmd install --prefix .npm-cache/storage-tests --no-package-lock playwright @electric-sql/pglite`

Inicie a aplicação com `npm.cmd run dev -- --port 3100` (ou use uma instância de produção e configure `STORAGE_TEST_URL`), e execute:

- `node docs/storage-browser.test.cjs`: acesso e fluxo completo nos três perfis, produto sem imagem em três posições, sugestão, desfazer/refazer e recarga.
- `node docs/storage-interaction.test.cjs`: arraste com mouse e toque, pinça/deslocamento, 5→6 prateleiras, redimensionamento, exclusão com cancelar/confirmar, importação válida/inválida, conflito entre abas e cena com 610 objetos/500 posições.
- `node docs/storage-database.test.cjs`: execução repetida da migração em PostgreSQL local, políticas dos perfis com funções de autorização de teste, isolamento entre empresas, revisão concorrente e rejeição de produto de outra empresa.

Os testes de navegador usam Edge em modo headless, resolução 1024 × 768 e suporte a toque, em contextos de demonstração isolados. Não acessam produtos reais. A simulação não substitui testes em tablet físico e no Supabase do cliente.
