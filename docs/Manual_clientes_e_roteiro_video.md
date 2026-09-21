# SISTEMA DE CONTROLE DE ESTOQUE
## Guia de funcionalidades por usuário
Manual para apresentação aos clientes e roteiro de vídeo

Edição: 13 de setembro de 2026

Este material explica as funções disponíveis na interface do projeto analisado, apresenta as responsabilidades de cada perfil e orienta uma demonstração prática do sistema.

O programa reúne empresas, produtos, estoque, vendas, compradores, pagamentos e relatórios. Cada usuário acessa os recursos correspondentes ao seu perfil e às empresas às quais está vinculado.

### Os três perfis
- Administrador do Sistema: organiza empresas, usuários e cadastros, acompanha os resultados e realiza as ações administrativas.
- Gestor: acompanha as empresas sob sua responsabilidade, mantém produtos e consulta vendas, custos e resultados.
- Funcionário: consulta produtos, registra suas vendas e acompanha os pagamentos e recibos das vendas que pode visualizar.

### Como usar este documento
1. Use as seções 1 a 7 para explicar o sistema aos clientes.
2. Use a seção 8 como roteiro de gravação, com ações na tela e falas sugeridas.
3. Consulte a seção 9 antes de gravar ou fazer uma apresentação comercial.

### Conteúdo
1. Visão geral e acesso
2. Comparativo de permissões
3. Administrador do Sistema
4. Gestor
5. Funcionário
6. Vendas, pagamentos e recibos
7. Relatórios e calculadoras
8. Roteiro de vídeo
9. Notas de validação para o responsável pela apresentação

Base documental: interface, regras de permissão, API de usuários e scripts do banco presentes no projeto. A análise foi feita no código; não inclui teste com contas reais nem confirmação da configuração do ambiente publicado.
<!-- pagebreak -->
# 1. Visão geral e acesso
### O que o sistema ajuda a fazer
O sistema centraliza a consulta do estoque e o registro das vendas. Os produtos ficam vinculados a uma empresa ou loja, e cada venda identifica produto, quantidade, preço praticado, comprador, vendedor e situação do pagamento.

Para apresentar ao cliente: “Você encontra os produtos, registra as vendas e acompanha os pagamentos em um só lugar. A equipe usa acessos individuais, e a gestão consulta os resultados das empresas autorizadas.”

### Como entrar
1. Abra o sistema e acesse a tela de login.
2. Preencha Empresa, Nome e Senha com os dados do cadastro.
3. Clique em Entrar.
4. Confira a empresa atual e o perfil exibidos no cabeçalho.
5. Ao terminar, clique em Sair.

O acesso depende de usuário ativo, empresa válida e vínculo autorizado. Para cadastrar ou alterar acessos, procure o Administrador do Sistema.

### Empresas e lojas
As abas superiores permitem selecionar as empresas liberadas para o usuário. Administrador e Gestor também têm a opção Todas as empresas; para o Gestor, essa visão reúne somente as empresas dentro do seu acesso.

Um Funcionário pode ter vínculo com mais de uma empresa e alternar entre as abas disponíveis. Ele não recebe o botão Todas as empresas.

### Consulta de produtos
Em Produtos cadastrados, pesquise pelo nome e confira produto, empresa/loja, posição no estoque, preço de venda, quantidade e foto. Clique na foto para ampliá-la, quando houver imagem cadastrada.

O preço de compra é exibido para Administrador e Gestor. O Funcionário não visualiza essa coluna nem a área de lucro.

### Exemplo de uso
Uma loja cadastra o produto “Cadeira Modelo A”, com 10 unidades, preço de compra de R$ 100,00 e preço de venda de R$ 150,00. Ao registrar uma venda de 2 unidades por R$ 150,00 cada, o total é R$ 300,00 e o estoque passa a 8 unidades. Para os perfis de gestão, o lucro calculado dessa venda é R$ 100,00, considerando esse custo registrado.

Esse exemplo será usado no roteiro de vídeo. Os nomes e valores são fictícios.
<!-- pagebreak -->
# 2. Comparativo de permissões
As permissões abaixo descrevem os caminhos disponíveis na interface. “Empresas vinculadas” significa as empresas liberadas para aquele usuário.

| Funcionalidade | Administrador | Gestor | Funcionário |
| --- | --- | --- | --- |
| Consultar produtos, estoque e fotos | Sim | Empresas vinculadas | Empresas vinculadas |
| Ver preço de compra | Sim | Sim | Não |
| Criar produtos e usar Editar | Sim | Empresas vinculadas | Não |
| Ajustar preço de venda e quantidade na lista | Sim | Sim | Controles visíveis; ver nota 9 |
| Alterar empresa de produto já cadastrado | Sim | Não | Não |
| Excluir produto | Sim | Não | Não |
| Cadastrar empresa | Sim | Não | Não |
| Editar dados da empresa | Sim | Empresas vinculadas | Não |
| Inativar, reativar ou excluir empresa | Sim | Não | Não |
| Cadastrar usuários e definir perfis | Sim | Não | Não |
| Alterar nome, senha e situação de usuários | Sim | Não | Não |
| Ajustar vínculos de funcionários | Sim | Dentro do próprio acesso | Não |
| Excluir usuário pela interface | Sim, exceto administrador | Não | Não |
| Registrar venda | Sim | Sim | Em seu próprio nome |
| Consultar histórico de vendas | Empresas acessíveis | Empresas vinculadas | Vendas próprias ou registradas por ele |
| Consultar pendências e alterar pagamento | Vendas visíveis | Vendas visíveis | Vendas visíveis |
| Visualizar, imprimir e baixar recibo PDF | Vendas visíveis | Vendas visíveis | Vendas visíveis |
| Apagar venda do histórico | Sim | Não | Não |
| Ver lucro, gráfico e exportar CSV | Sim | Empresas vinculadas | Não |
| Usar calculadora de negociação | Não há esse cartão | Sim | Sim |
| Usar calculadora flutuante básica | Sim | Sim | Sim |

O Administrador não pode excluir uma conta com perfil Administrador do Sistema. Na API, também há bloqueio para excluir ou inativar a própria conta.

A alteração do pagamento é feita nos registros que o usuário consegue consultar. O histórico e as pendências do Funcionário não devem ser apresentados como uma visão completa das vendas da empresa.
<!-- pagebreak -->
# 3. Administrador do Sistema
### Responsabilidade principal
Organizar a estrutura do sistema e acompanhar a operação. É o perfil indicado para quem precisa controlar empresas, acessos, cadastros e resultados.

### Empresas
- Abrir Nova empresa e informar nome, telefone, endereço e dados complementares.
- Vincular usuários à empresa.
- Consultar e pesquisar em Empresas cadastradas.
- Editar dados, inativar, reativar e solicitar exclusão de empresas.
- Alternar entre empresas ou consultar Todas as empresas.

### Usuários
- Abrir Cadastrar usuário e informar nome, senha, perfil e empresas autorizadas.
- Cadastrar Funcionário, Gestor ou Administrador do Sistema.
- Em Usuários Cadastrados, editar nome, definir nova senha, alterar perfil e ajustar empresas vinculadas.
- Inativar e reativar contas; excluir contas permitidas.

O nome informado no cadastro também é utilizado como nome de acesso. Na edição, o campo Nova senha pode ficar vazio para manter a senha atual. O cadastro real exige senha com pelo menos 8 caracteres.

### Produtos e estoque
- Cadastrar nome, preço de venda, valor real da compra, quantidade, posição no estoque e empresa.
- Adicionar, substituir e remover imagem do produto.
- Editar produtos e ajustar preços e quantidades.
- Alterar a empresa de um produto existente.
- Excluir produtos; quando a exclusão não puder ser concluída, o sistema pode tentar inativá-los e retirá-los da listagem.

As imagens aceitas são JPG/JPEG, PNG e WebP, com tamanho de até 5 MB.

### Operação e resultados
Pode registrar vendas, selecionar vendedor cadastrado, consultar histórico, atualizar pagamentos, consultar compras pendentes, emitir recibos e acessar Lucro. Também pode apagar vendas; o fluxo solicita confirmação e busca devolver a quantidade ao estoque. Confira a mensagem final e o estoque após essa ação.

### Fala sugerida para o cliente
“O Administrador organiza a estrutura do sistema: cadastra empresas, define os acessos da equipe e mantém os produtos. Também acompanha vendas e resultados e realiza as ações administrativas de exclusão e inativação.”
<!-- pagebreak -->
# 4. Gestor
### Responsabilidade principal
Acompanhar a operação e os resultados das empresas vinculadas ao seu acesso.

### Funcionalidades disponíveis
- Selecionar uma empresa ou usar Todas as empresas dentro do seu acesso.
- Consultar Empresas cadastradas e editar nome, telefone, endereço e dados complementares das empresas autorizadas.
- Cadastrar produtos e editar seus dados, incluindo preços, quantidade, posição no estoque e imagens.
- Consultar preço de compra e preço de venda.
- Registrar vendas e selecionar vendedor cadastrado disponível.
- Consultar vendas, compradores, pagamentos e recibos das empresas autorizadas.
- Atualizar a situação do pagamento e acompanhar Compras pendentes.
- Acessar Lucro, aplicar filtros, visualizar gráfico e exportar CSV.
- Usar a calculadora de negociação e a calculadora flutuante.

### Funcionários vinculados
O botão Funcionários vinculados permite consultar os funcionários dentro do escopo exibido e editar seus vínculos com empresas. O Gestor só deve alterar vínculos dentro das empresas às quais tem acesso, preservando os vínculos externos ao seu escopo.

Nesse formulário, nome e perfil ficam bloqueados. O Gestor não recebe campos de senha nem de ativação do usuário.

### Limites na interface
O Gestor não cadastra empresas ou usuários; não inativa, reativa ou exclui empresas; não exclui produtos ou vendas. Também não altera a empresa de um produto já cadastrado nem tem botão de exclusão de usuários na interface.

### Rotina sugerida
1. Selecione a empresa desejada.
2. Confira produtos e quantidades e mantenha os cadastros atualizados.
3. Acompanhe Produtos vendidos e Compras pendentes.
4. Atualize o pagamento quando houver confirmação do recebimento.
5. Abra Lucro, escolha os filtros e exporte os registros quando necessário.

### Fala sugerida para o cliente
“O Gestor cuida da rotina das lojas autorizadas. Ele mantém produtos e estoque, acompanha vendas e pendências e consulta os resultados. Também pode ajustar as empresas vinculadas aos funcionários dentro do seu próprio acesso.”
<!-- pagebreak -->
# 5. Funcionário
### Responsabilidade principal
Atender o cliente, consultar produtos e registrar vendas identificadas com o seu usuário.

### Funcionalidades disponíveis
- Alternar entre as empresas vinculadas ao seu acesso.
- Pesquisar produtos e consultar quantidade, preço de venda e posição no estoque.
- Abrir fotos dos produtos para facilitar a identificação.
- Usar a calculadora de negociação para simular descontos, acréscimos e divisão em parcelas.
- Registrar vendas em Baixa/Venda de Produto.
- Informar produto, quantidade, preço real de venda, comprador e pagamento.
- Consultar Produtos vendidos com vendas em que é o vendedor ou que foram registradas por seu usuário.
- Consultar Compras pendentes, atualizar pagamentos e acessar recibos dessas vendas.
- Imprimir recibos e baixá-los em PDF.

Na venda, o vendedor é preenchido com o próprio Funcionário e o campo fica bloqueado para alteração.

### Limites de acesso
O Funcionário não visualiza preço de compra nem a área Lucro. Não recebe botões para cadastrar empresas, cadastrar usuários, criar produtos, abrir o formulário Editar produto ou excluir registros.

A lista de produtos apresenta controles de ajuste de preço de venda e quantidade também para esse perfil. Como a autorização efetiva depende do banco e do modo de execução, esse ponto está destacado na seção 9 e deve ser validado antes da apresentação.

### Passo a passo de uma venda
1. Selecione a empresa correta e confira a disponibilidade do produto.
2. Abra Baixa/Venda de Produto.
3. Pesquise e selecione o produto.
4. Informe a quantidade e confira o preço real de venda por unidade.
5. Informe o nome do comprador e selecione o pagamento.
6. Confira os dados e clique em Confirmar venda.
7. Se aparecer um aviso, leia e decida se deve continuar.
8. Imprima o recibo quando necessário ou consulte-o depois no histórico.

### Fala sugerida para o cliente
“O Funcionário encontra os produtos e registra a venda com seu nome já identificado. Depois, acompanha seus registros, atualiza a situação do pagamento e fornece o recibo ao comprador. Custos de compra e relatórios de lucro ficam nos perfis de gestão.”
<!-- pagebreak -->
# 6. Vendas, pagamentos e recibos
### Registro e baixa de estoque
Cada registro de venda contém um produto e sua quantidade. O formulário permite informar o preço efetivamente praticado, que pode ser diferente do preço cadastrado. A quantidade vendida é descontada do estoque.

Para demonstrar vários produtos, registre vendas separadas: o formulário atual não apresenta um carrinho com vários itens.

### Situação do pagamento
| Situação | Significado no sistema |
| --- | --- |
| Pago | Venda marcada como quitada. |
| Pago parcialmente | Venda com pagamento parcial, ainda incluída nas pendências. |
| Não Pago | Venda ainda pendente de pagamento. |

O sistema permite alterar essa situação no histórico e na consulta de pendências. Essa alteração é manual; não representa processamento de cartão, PIX ou confirmação bancária automática.

### Compras pendentes
Apesar do nome, essa tela reúne vendas a compradores marcadas como Não Pago ou Pago parcialmente. Permite pesquisar o comprador, consultar seus registros pendentes, alterar o pagamento e abrir recibos.

O total exibido soma o valor integral dessas vendas. Não há campo para registrar quanto já foi pago; portanto, em uma venda parcial, o valor exibido não representa o saldo exato a receber. Exemplo: uma venda de R$ 300,00 marcada como parcial continua contribuindo com R$ 300,00 para o total, mesmo que o comprador já tenha pago R$ 100,00.

### Avisos durante a venda
- Quantidade maior que o estoque: o sistema apresenta um aviso e oferece a opção de continuar. A confirmação pode deixar o estoque negativo.
- Comprador com pendências: o sistema avisa sobre compras pendentes encontradas nas vendas visíveis ao usuário e permite confirmar a continuação.

Esses avisos pedem uma decisão do operador; não são bloqueios automáticos definitivos. O alerta de pendências respeita o alcance de consulta de cada perfil.

### Histórico e recibos
Produtos vendidos permite filtrar por produto, empresa, vendedor, comprador e pagamento. Os registros mostram dados da venda e dão acesso ao recibo. Administrador e Gestor também visualizam lucro.

O Recibo de Venda apresenta número, empresa, data, comprador, vendedor, pagamento, responsável pelo registro, produto, quantidade, preço e total. Pode ser visualizado, impresso ou baixado em PDF. A própria tela o identifica como comprovante interno, sem valor de nota fiscal.
<!-- pagebreak -->
# 7. Relatórios e calculadoras
### Relatório Lucro — Administrador e Gestor
O relatório reúne as vendas do escopo selecionado. Os filtros incluem dia, mês, hora, ano, empresa, vendedor, comprador, produto e pagamento.

Apresenta Compra do Estoque, Valor da Venda, Lucro, Lucro Real, quantidade vendida, simulações de comissão e valores após comissão, além de um gráfico de barras e uma lista detalhada das vendas.

### Como explicar os números
- Compra do Estoque: soma do custo registrado nas vendas multiplicado pelas quantidades. Não é o valor de todo o estoque disponível.
- Valor da Venda: soma dos preços efetivos de venda multiplicados pelas quantidades.
- Lucro: valor vendido menos o custo registrado dessas vendas.
- Lucro Real: na versão analisada, usa o mesmo cálculo de Lucro. Não desconta automaticamente despesas gerais, impostos, aluguel ou salários.

O relatório pode incluir vendas não pagas e parcialmente pagas. Use o filtro Pagamento quando quiser separar as situações; os totais não equivalem automaticamente ao dinheiro recebido em caixa.

### Comissões
O campo associado a lucro real calcula uma porcentagem sobre o lucro. O campo chamado lucro total calcula uma porcentagem sobre o valor vendido. Os resultados após comissão são apresentados separadamente; os dois percentuais não são descontados juntos no mesmo cálculo.

Exemplo: custo de R$ 200,00, venda de R$ 300,00 e lucro de R$ 100,00. Uma comissão de 10% sobre lucro real corresponde a R$ 10,00; uma comissão de 10% no campo lucro total corresponde a R$ 30,00, pois sua base é o valor vendido.

Esses campos fazem cálculos no relatório. Não constituem pagamento automático de comissão nem cadastro permanente de uma política de remuneração.

### Exportação
Exportar CSV baixa os registros filtrados em arquivo compatível com Excel, incluindo informações das vendas, custos, lucro, comissões e data. O formato gerado é .csv, não .xlsx.

### Calculadora de negociação — Gestor e Funcionário
Permite informar valor base, desconto percentual e em reais, acréscimo percentual e em reais e número de parcelas. Exibe o valor final e o valor por parcela, com opções para limpar os campos e copiar o resultado.

É uma simulação: o valor negociado precisa ser informado no campo Preço real de venda. A divisão em parcelas não cria cobranças ou um calendário de recebimentos.

### Calculadora flutuante — todos os perfis
Oferece operações básicas, porcentagem e troca de sinal. Pode ser movida, aberta e minimizada; fica oculta nas telas de usuários.
<!-- pagebreak -->
# 8. Roteiro de vídeo
### Preparação
Use contas de demonstração com os três perfis, uma empresa fictícia, um produto com foto e posição no estoque e um comprador fictício. Prepare 10 unidades da Cadeira Modelo A, custo de R$ 100,00 e venda de R$ 150,00. Grave a digitação das senhas fora do enquadramento.

Roteiro sugerido: 8 a 10 minutos, ajustando as pausas ao ritmo da demonstração. As falas abaixo são uma base editável.

### Cena 1 — Apresentação | 0:00 a 0:40
Na tela: página inicial e painel já autenticado.
Fala: “Este sistema ajuda a organizar o estoque, registrar vendas e acompanhar pagamentos. Ele possui três perfis: Administrador do Sistema, Gestor e Funcionário. Vou mostrar o que cada um faz na rotina da loja.”

### Cena 2 — Acesso e empresas | 0:40 a 1:20
Na tela: campos Empresa, Nome e Senha; depois, cabeçalho e abas das empresas.
Fala: “Cada pessoa entra com seu acesso e trabalha nas empresas autorizadas. No topo, você confere a empresa atual. Administradores e gestores também podem consultar uma visão conjunta das empresas disponíveis.”

### Cena 3 — Administrador | 1:20 a 2:40
Na tela: Nova empresa, Cadastrar usuário e Usuários Cadastrados. Mostre os campos sem salvar mudanças desnecessárias.
Fala: “O Administrador organiza a estrutura: cadastra empresas, cria os acessos e define o perfil e as lojas de cada usuário. Também pode editar cadastros e controlar quais contas permanecem ativas.”
Na tela: Novo produto; mostre nome, compra, venda, quantidade, posição e foto.
Fala: “No produto, cadastramos o preço de venda, o custo de compra, a quantidade e a localização no estoque. A foto ajuda a equipe a identificar o item.”

### Cena 4 — Gestor | 2:40 a 3:40
Na tela: entre como Gestor e abra Produtos cadastrados, Empresas cadastradas e Funcionários vinculados.
Fala: “O Gestor acompanha as lojas liberadas para ele. Pode manter produtos e estoque, editar os dados dessas empresas e ajustar os vínculos dos funcionários dentro do seu acesso. Também consulta custos, vendas e resultados.”

### Cena 5 — Funcionário e venda | 3:40 a 5:20
Na tela: entre como Funcionário, pesquise a Cadeira Modelo A, amplie a foto e abra Baixa/Venda de Produto.
Fala: “No perfil de Funcionário, vemos preço de venda e estoque. O custo de compra e a área de lucro não aparecem. Agora vamos vender duas unidades, por R$ 150,00 cada, para o comprador Cliente Demonstração.”
Na tela: preencha comprador, escolha Não Pago, confira o vendedor bloqueado e confirme.
Fala: “O vendedor já fica identificado. Depois da confirmação, a venda soma R$ 300,00 e o estoque passa de dez para oito unidades.”
<!-- pagebreak -->
# 8. Roteiro de vídeo — continuação
### Cena 6 — Recibo e pendências | 5:20 a 6:30
Na tela: abra o recibo e mostre Imprimir e Baixar PDF. Depois, abra Compras pendentes e pesquise Cliente Demonstração.
Fala: “A venda gera um recibo interno, que pode ser impresso ou baixado em PDF. Como marcamos Não Pago, ela aparece nas compras pendentes. Quando o pagamento for confirmado, atualizamos a situação para Pago.”
Na tela: atualize a situação para Pago e mostre a saída da venda das pendências.
Fala: “Também existe a opção Pago parcialmente. Ela identifica que ainda há pendência, mas o sistema não calcula o valor restante já descontando pagamentos parciais.”

### Cena 7 — Resultados da gestão | 6:30 a 7:50
Na tela: entre como Gestor, abra Lucro e filtre o produto e o comprador usados na demonstração.
Fala: “A gestão acompanha as vendas com filtros e gráfico. Neste exemplo, vendemos R$ 300,00, com custo registrado de R$ 200,00, resultando em R$ 100,00 de lucro calculado. Esse valor considera o custo do produto, sem descontar as demais despesas da empresa.”
Na tela: mostre os campos de comissão e o botão Exportar CSV.
Fala: “Podemos simular uma comissão sobre o lucro ou sobre o valor vendido e exportar os registros em CSV para abrir no Excel.”

### Cena 8 — Calculadora | 7:50 a 8:30
Na tela: com o Gestor, abra Calculadora, informe R$ 150,00 e desconto de 10%.
Fala: “A calculadora ajuda na negociação. Com dez por cento de desconto, R$ 150,00 passa a R$ 135,00. Também é possível simular acréscimos e dividir o valor em parcelas. Depois, informamos o preço negociado na venda.”

### Cena 9 — Encerramento | 8:30 a 9:00
Na tela: painel e identificação do perfil.
Fala: “O Administrador organiza empresas e acessos. O Gestor acompanha a operação e os resultados. O Funcionário consulta os produtos e registra suas vendas. Assim, cada pessoa encontra as funções necessárias para sua rotina.”

### Cenas opcionais para um vídeo de treinamento
- Venda acima do estoque: mostre o aviso e explique que continuar pode gerar quantidade negativa. Não use essa venda no exemplo básico de lucro.
- Comprador com pendências: prepare uma venda Não Pago e tente uma nova venda para o mesmo comprador, com o mesmo perfil. Mostre a decisão de continuar ou cancelar.
- Várias empresas: use um Gestor vinculado a duas lojas e alterne entre a visão individual e Todas as empresas.

### Conferência antes de gravar
1. Teste as três contas no mesmo ambiente que será apresentado.
2. Confira a empresa selecionada em cada cena.
3. Use apenas dados fictícios no vídeo.
4. Confirme produto, estoque inicial, custo e preço do exemplo.
5. Abra um recibo PDF e um CSV para conferir os arquivos.
6. Revise as observações da próxima seção e evite apresentar recursos sem acesso funcional.
<!-- pagebreak -->
# 9. Notas de validação para o apresentador
Esta seção é destinada a quem prepara a demonstração. Registra diferenças encontradas no código que podem afetar as explicações e precisam ser conferidas no ambiente utilizado.

### 9.1 Ajustes de produto pelo Funcionário
O botão Editar produto é restrito a Administrador e Gestor. Porém, a janela Produtos cadastrados encaminha os controles de ajuste direto de preço de venda e quantidade para todos os perfis, e a função de salvamento não contém um bloqueio geral por perfil para esses ajustes.
Consequência: não afirme que o Funcionário é estritamente de consulta do estoque sem testar esses controles com uma conta real. A efetivação pode depender das regras aplicadas no banco. O modo de demonstração local tem comportamento próprio.

### 9.2 Exclusão de funcionários pelo Gestor
A interface do Gestor não oferece exclusão de usuários. Entretanto, a API possui uma regra que permite ao Gestor excluir funcionários que compartilham uma empresa autorizada. O comparativo deste manual descreve a interface; a restrição efetiva da API deve ser revisada caso a política pretendida seja permitir exclusões somente ao Administrador.

### 9.3 Produtos não entregues
Existem código de formulário, consultas e funções para produtos não entregues, mas não foi encontrado um botão de entrada nem a montagem desse formulário entre os modais ativos da tela principal. Por isso, o recurso não foi apresentado como funcionalidade acessível nem incluído na demonstração padrão.

### 9.4 Venda acima do estoque e lucro
O código trata vendas marcadas como acima do estoque de forma especial: atribui custo equivalente a duas vezes o preço de venda, e o lucro da venda é exibido como o negativo do seu valor total. Isso não corresponde ao custo normal cadastrado do produto.
Exemplo: uma venda de R$ 300,00 marcada nessa condição pode aparecer com lucro de -R$ 300,00. Evite misturar esse caso com o exemplo comum de lucro e valide se essa regra corresponde ao funcionamento desejado para o cliente.

### 9.5 Pagamento parcial e indicadores
As pendências somam o valor integral das vendas parciais. Lucro e Lucro Real usam a mesma base de cálculo. A comissão denominada lucro total incide sobre vendas. Esses detalhes estão explicados nas seções 6 e 7 para evitar interpretações incorretas dos valores.

### 9.6 Versão analisada e ambiente publicado
O projeto contém scripts de migração e alterações de permissões. A presença desses arquivos não comprova que foram executados no banco utilizado pelo cliente. O README também contém referências antigas de perfis; este manual utiliza os três nomes definidos na interface atual.

### Referências internas da análise
- src/lib/permissions.js: nomes dos perfis e regras de exibição por função.
- src/components/StockApp.js: telas, filtros, cadastros, vendas, recibos, calculadoras e relatórios.
- src/app/api/admin/create-user/route.js: criação, edição e exclusão de usuários.
- supabase/allow-stock-exceeded-sales.sql: tratamento de vendas acima do estoque.

Documento preparado a partir do código disponível em 13/09/2026. Não foram alteradas as funcionalidades do programa para produzir este material.
