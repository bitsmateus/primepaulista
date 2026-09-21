# Decisões pendentes e observações

Anotações feitas durante a implementação da paridade com o sistema M7 Concept
(branch `feat/paridade-m7`). Tudo aqui é para você revisar quando voltar.
Nada foi enviado ao GitHub nem colocado em produção.

## Como o trabalho foi conduzido
- Tudo em uma branch separada (`feat/paridade-m7`); `main` ficou intocada.
- Testes rodaram contra um Postgres **local descartável** (porta 54329), nunca contra o banco de produção.
- Fora de escopo por decisão sua: Meta API oficial (WhatsApp Cloud/Instagram). O CRM continua no Uazapi.

## Correções ao meu relatório de comparação
- Acessórios já tinham os botões −1/+1. O que faltava era só o +5 e o leitor de código.

## Decisões que tomei sozinho (revise se discordar)

### Fase 1 — Estoque
- **Marca vale para qualquer aparelho** (padrão "Apple"). A categoria continua livre; os modelos sugeridos continuam sendo o catálogo Apple.
- **Localização é texto livre** com sugestões (Estoque, Vitrine 1, Vitrine 2, Assistência + as já usadas). Não criei uma tabela de locais.
- **Excluir aparelho**: agora é bloqueado se o aparelho está Vendido **ou já apareceu em alguma venda** (mesmo que a venda tenha sido devolvida). Isso protege o histórico, mas significa que um aparelho devolvido nunca poderá ser excluído, só ficar em estoque. Se preferir liberar o excluir depois de devolução, é uma linha no servidor.
- **Importação**: linha sem nenhum IMEI/serial recebe um serial interno automático (INT-ano-número) em vez de ser recusada. Duplicidade de IMEI/serial só é checada na importação; o cadastro manual continua aceitando.
- **Importar com "substituir estoque"** apaga só aparelhos não vendidos e sem histórico de venda, e exige digitar APAGAR.
- **Excel**: suporto só `.xlsx` (o `.xls` antigo não). A tela avisa para salvar como .xlsx ou CSV.
- **"Zerar preço de todos"**: remove o preço de venda (fica "—"). **Cuidado:** no PDV, aparelho sem preço de venda é oferecido pelo **preço de custo**. Deixei um aviso na confirmação. Se quiser, posso mudar o PDV para bloquear a venda de aparelho sem preço.
- **Balanço** usa um carimbo "conferido em" por aparelho (não uma tabela de sessões). "Novo balanço" limpa todos os carimbos.
- **Ordenação "modelos mais antigos → mais novos"** usa a ordem do catálogo Apple do sistema; modelos fora do catálogo (ex.: Samsung) ficam no fim.
- **Leitor por câmera**: usei a biblioteca `html5-qrcode`. Testei com uma câmera simulada lendo um código CODE128 de verdade (funcionou). Em celular real pode variar com a luz/foco; o campo manual sempre existe como alternativa.
- **Peso do app**: as bibliotecas novas (scanner e Excel) entram em blocos separados, só carregados quando usados. O cache do PWA passou de ~2,0 MB para ~2,5 MB.

### Fase 2 — Vendas e orçamentos
- **Orçamento não reserva o aparelho.** Se outro vendedor vender antes, o PDV avisa e não leva o item ao carrinho. Se quiser reservar (status "Reservado") ao criar/aprovar, dá para fazer.
- **Orçamento vencido ainda pode ser convertido em venda** (o vendedor decide; a proposta impressa sai com o aviso "ORÇAMENTO VENCIDO"). Posso bloquear se preferir.
- **WhatsApp do orçamento** abre a conversa (wa.me) com o texto pronto, você toca em enviar. Não usei o Uazapi para enviar sozinho, para o vendedor revisar antes.
- **Excluir orçamento**: admin ou quem criou. Orçamento já convertido nunca é excluído.
- **Mercado Pago / Link** e **Outro**: **não aplicam taxa** no cálculo de lucro (só cartão de crédito/débito paga os 2,5%). Se o Mercado Pago cobra taxa, me diga o percentual e eu incluo.
- **Ticket médio por vendedor**: o BI já definia ticket médio como *lucro por venda*. No comparativo do Dashboard mostro os dois (faturamento/vendas e lucro/vendas) para não haver dúvida.
- **Vendas antigas** ficam como origem "Balcão".
- **Lista de vendedores** no orçamento reaproveita a do PDV (Gabriel, Matheus, Tassio + usuário logado).

### Fase 3 — Assistência técnica
- **O envio real pelo Uazapi NÃO foi testado** (não há instância real aqui). Testei o caminho completo do servidor contra um servidor HTTP falso local que imita os endpoints `/instance/status` e `/message/text` (enviado, recusa do provedor, desconectado, sem instância, sem telefone). Se o formato real do Uazapi for diferente do que o resto do sistema já usa, o aviso ficará como "Pendente/Falhou" com o motivo na tela, sem quebrar nada. Teste um envio real antes de confiar.
- **Números de telefone**: se o telefone da OS tiver 10 ou 11 dígitos, o servidor acrescenta o **55** (Brasil) antes de enviar. O envio manual do CRM continua como era.
- **Situação dos avisos**: "Pendente" = nem tentou enviar (sem telefone, sem número ativo, WhatsApp desconectado); "Falhou" = tentou e o provedor recusou/deu erro. Só "Enviado" tira a OS do filtro Pendentes. Cada mudança de coluna que gera aviso envia uma mensagem; arrastar a OS passando por "Aguardando Aprovação" no caminho para "Pronto" (arrasto passo a passo) dispara também o aviso de aprovação. Se preferir que só o destino final avise, é ajuste pequeno.
- **Usa sempre a primeira instância de WhatsApp ativa** (a mesma escolha da automação do CRM). Se houver vários números, não dá para escolher qual envia os avisos de OS ainda.
- **Chave PIX**: a linha do modelo que contém `{chave_pix}` some sozinha se a chave estiver desligada/vazia ou se a OS for isenta (garantia/cortesia/valor zero). No modelo padrão de "Pronto para Retirada" existe a linha "Pagamento via PIX: {chave_pix}".
- **Filtro Pendentes** ignora eventos desligados e ignora OS de estoque **sem telefone** (não há cliente para avisar). OS de cliente sem telefone continua pendente (é o sinal para corrigir o cadastro). Não conta OS "Entregue" antigas como pendentes.
- **Aparelho do estoque restaurado**: volta ao status anterior (Disponível ou Reservado; se já estava "Em Manutenção" volta para Disponível) e ao local anterior — mas só se o local ainda for "Assistência" (se alguém mudou o local à mão, mantém o que está). Não sobrescreve se o aparelho foi vendido/alterado.
- **Reabrir uma OS finalizada** (arrastar de volta) de aparelho de estoque tenta travar o aparelho de novo; se ele foi vendido ou entrou em outra OS, a reabertura é recusada (409). Reabrir também limpa a data de conclusão.
- **Origem e aparelho não mudam depois** de criada a OS (para não bagunçar o estoque). Para trocar, exclua e abra outra.
- **OS de estoque sem cliente** fica com o nome "Estoque da loja".
- **Vendas de aparelho "Em Manutenção"**: o PDV só bloqueia aparelho Vendido; um aparelho que está numa OS ainda pode ser vendido. Se isso ocorrer, a OS finalizada não mexe no aparelho (regra pedida). Se quiser bloquear a venda de aparelho em assistência, é uma linha no servidor.
- **Excluir aparelho que está numa OS**: a OS continua existindo com os dados copiados (o vínculo é solto), sem erro.
- **Movimentações de estoque**: envio à assistência registra "saída" e o retorno registra "entrada" no histórico do aparelho (motivo com o número da OS).
- **Quem pode o quê**: qualquer usuário logado cria/edita/move OS e envia aviso; só admin exclui OS e edita as mensagens/configurações (como antes para excluir).
- **Configurações genéricas** (`app_settings`): a lista de chaves permitidas fica em `server/src/services/settings.ts` (hoje só `os_messages`). Leitura por qualquer usuário logado; gravação só admin, com validação. A chave PIX fica legível por todos os cargos (aparece nos avisos de qualquer forma).
- A regra de montar a mensagem existe em **duas cópias** (`src/lib/osMessages.ts` para a prévia e `server/src/services/osMessages.ts` para o envio), porque a API é implantada separada do site. Um teste roda os mesmos casos nas duas e falha se divergirem.
- **Kanban com 7 colunas** exige rolagem horizontal em telas menores (já era assim com 5). Arrastar para colunas fora da tela usa a rolagem automática do arrasto.

### Fase 4A — Gestão (fornecedores, cargos, auditoria, configurações, conta e segurança)
- **Matriz de permissões (é uma PROPOSTA; revise em Usuários > "O que cada cargo pode")**. Fica em `src/lib/permissions.ts` e `server/src/lib/permissions.ts` (duas cópias idênticas, porque a API é implantada separada; um teste falha se divergirem). Para mudar, altere as duas.
  - Escolhas minhas onde o pedido era ambíguo: (1) o **gerente edita Loja, Logo, Termos de garantia, Segurança e mensagens de OS** (o item das Configurações dizia isso, e a lista do cargo dizia "sem editar identidade da loja"; segui o mais específico); só **Variáveis e Backup** são exclusivos do admin. (2) **Estoquista não exclui registros** (aparelho/acessório/cliente/OS/fornecedor): "estoque completo" ficou sem o botão de excluir; é só dar `deleteRecords` a ele. (3) **Estoquista e financeiro leem os dados de vendas** (a tela de Garantias e o Dashboard dependem disso); a tela "Vendas" continua só para admin, gerente, vendedor e financeiro. (4) Financeiro e estoquista **não têm a tela de Clientes** no menu (a API de listar clientes continua aberta a todo usuário logado, como já era). (5) O **vendedor** vê a lista de fornecedores (para escolher no cadastro do aparelho), mas não a ficha nem o total comprado. (6) Criei a capacidade `managePlanning` (admin e gerente), **reservada**, sem tela ainda.
- **Endurecimento para o TÉCNICO (única mudança de comportamento dos cargos antigos)**: a API passou a responder 403 ao técnico em 9 rotas que a tela dele nunca usou: criar venda (`POST /sales`), anexar arquivo à venda, e o CRM/WhatsApp (funil, tarefas, histórico de mensagens, criar lead, lista de números, automações). Mantive a **leitura de leads** para o técnico, porque o formulário de OS usa os leads para sugerir clientes. Admin e vendedor: nenhuma mudança (provado por teste, 562 combinações cargo x rota). Se preferir o comportamento antigo, é trocar a capacidade dessas rotas em `server/src/routes/sales.ts`, `saleAttachments.ts`, `crm.ts`, `whatsapp.ts` e `automations.ts`.
- **Cargo vale na hora**: rotas protegidas revalidam o cargo e se a conta está ativa no banco a cada chamada; rebaixar/desativar tem efeito imediato mesmo com o login antigo. Algumas rotas antigas só exigem "estar logado" (leitura de clientes, por exemplo) e seguem assim.
- **Trocar a senha NÃO derruba as outras sessões** (o login é um token de 7 dias sem estado no servidor). Para derrubar sessões seria preciso guardar uma "versão da sessão" por usuário. Decida se quer isso.
- **Senha errada no desbloqueio/troca de senha responde 400** (não 401), para o site não entender como "sessão expirada" e deslogar. Limites: login 8/min (como antes), desbloqueio 10/min, troca de senha 6/min, consulta de valor de variável 30/min (todos por IP).
- **Auditoria**: passa a registrar também login com sucesso/sem sucesso (e-mail digitado + IP; nunca a senha). Não há limpeza automática nem retenção: o volume cresce com o uso (a tela pagina no servidor). Um filtro de defesa remove de `details` qualquer campo com nome de senha/token/chave. Descrições ficam em português claro ("Devolveu a venda de R$ X para Fulano").
- **Fornecedores**: o nome é único sem diferenciar maiúsculas/espaços (409). Renomear atualiza o nome exibido nos aparelhos ligados (o texto `devices.supplier` continua existindo por compatibilidade). Aparelho novo não pode ser ligado a fornecedor **inativo**; aparelho que já era ligado a ele continua editável. Na migration, os fornecedores já digitados nos aparelhos viraram cadastros (idempotente; testei rodando duas vezes).
- **Variáveis customizadas**: cifradas com AES-256-GCM. A chave vem de `SETTINGS_ENC_KEY` (recomendado, opcional) ou, se não existir, é derivada do `JWT_SECRET`. **Trade-off**: se você trocar o `JWT_SECRET` sem ter definido `SETTINGS_ENC_KEY`, os valores já gravados deixam de poder ser lidos (é preciso cadastrar de novo). **Defina `SETTINGS_ENC_KEY` em produção antes de cadastrar variáveis.** O valor só sai pelo botão "Mostrar valor"/"Copiar" (auditado); nunca em listagens, em `GET /settings` nem no backup. Para as próximas fases: `getCustomVar("NOME")` em `server/src/services/secrets.ts`.
- **Backup**: a exportação inclui todos os dados de negócio e a auditoria, **sem** hash de senha, **sem** valores/nomes cifrados de variáveis e **sem** os números de WhatsApp (que guardam chaves de API). A restauração aceita **somente** chaves de configuração da lista permitida (loja, logo, garantia, mensagens de OS, segurança), validadas; dados de negócio **não** são restaurados por aqui (risco de corromper o banco): para isso use o backup do próprio banco.
- **Logo**: guardado como imagem dentro do banco (até ~900 mil caracteres, o navegador já reduz para 512 px). SVG é recusado de propósito (pode carregar código).
- **Termos de garantia**: os prazos editados passam a valer no PDV (garantia gravada em cada item vendido) e em Garantias; vendas antigas mantêm o prazo que gravaram. O texto do termo é livre e **não** é reescrito sozinho quando você muda um prazo: use `{dias_seminovo}`, `{dias_lacrado}`, `{dias_bateria}`, `{dias_servico}` no texto para acompanhar. A 2ª via de uma venda antiga sai com o termo **atual**.
- **Etiquetas**: hoje não trazem nome/dados da loja, então não mudei o layout aprovado (a impressão de etiqueta não muda).
- **Recibo de OS**: o slogan padrão era "Sua **L**oja no ❤️ de SP" e agora usa o mesmo da loja ("Sua **l**oja…"). É a única diferença visual dos padrões (o recibo de venda e o orçamento saem idênticos).
- **Mensagens de OS**: o nome e a chave PIX próprios passaram a vir **vazios** por padrão e, vazios, usam os da loja. Quem já tinha salvo um nome próprio continua com ele.
- **Notificações**: ligadas por padrão (aviso na tela + bipe), por usuário e por navegador; a notificação nativa só sai depois de clicar em "Permitir notificações do navegador" (Minha conta). Definições: OS pronta = em "Pronto para Retirada" sem aviso **enviado** (respeita o interruptor do evento e ignora OS de estoque sem telefone); tarefas = as de leads **do próprio usuário** (vencidas ou de hoje); orçamentos = os que vencem hoje (vendedor vê só os seus; admin/gerente todos); estoque baixo = quantidade menor ou igual ao mínimo (inclui zerado); parado = aparelho Disponível com entrada há mais de 30 dias. Navegadores costumam bloquear o bipe até a pessoa clicar em algo na página uma vez.
- **Bloqueio de tela**: é uma trava da interface (não encerra a sessão); o token continua guardado no navegador. Serve contra olhares no balcão, não contra quem tem acesso ao computador. O atalho é **Alt+L**. A inatividade considera mouse, teclado, toque e rolagem.
- **Ambiente de teste**: o Postgres local descartável estava com codificação WIN1252 e recusava emoji (❤️ do slogan, 🍎 das automações). Para testar de verdade, **recriei o `pp_test` em UTF8** (mesmo endereço do `.env`, que não foi alterado), reaplicando as migrations e semeando de novo. **Confirme que o banco de produção é UTF8**; se não for, salvar o slogan com ❤️ nas Configurações dá erro.
- **Carga de dados por tela (limite de 200 chamadas/min por IP)**: para as novidades não pesarem, a loja/logo/termos/segurança vêm em **uma** chamada (`GET /settings-bundle`) e os dados do **CRM** (leads, funil, tarefas, histórico, números de WhatsApp) passaram a ser buscados **só nas telas que os usam** (CRM, Assistência e BI). Nas demais telas o site faz menos chamadas do que antes (8 em vez de 11 para o administrador).
- **Testes automáticos**: os testes de tela agora contam as chamadas à API e esperam quando chegam perto do limite (antes um teste antigo podia levar 429 e falhar sem ser bug).

## Pendências que dependem de você
- **Fase 4A: revisar a matriz de permissões** (Usuários > "O que cada cargo pode") e o endurecimento do técnico (9 rotas de API que ele não usava).
- **Fase 4A, em produção**: definir `SETTINGS_ENC_KEY` (chave para cifrar variáveis) antes de cadastrar variáveis; confirmar que o banco é UTF8; a migration `0026` roda sozinha no deploy (cria fornecedores, os 3 cargos novos e converte os fornecedores já digitados nos aparelhos).
- **Fase 4A, testar em aparelhos reais** (não foi possível aqui): notificação nativa do navegador e bipe (os testes usaram espiões), Alt+L e bloqueio de tela no celular/tablet, "Copiar" valor de variável no navegador da loja.
- **Fase 4A, decidir**: se trocar a senha deve derrubar as outras sessões e se quer limpeza/retenção da auditoria.

## Observações de segurança encontradas
- **Fase 4A**: o **recibo de venda** continua sem escapar nome/CPF/observação do cliente e a descrição dos itens (para não alterar o layout aprovado); os dados novos da loja e o texto do termo de garantia **são escapados**. Vale aplicar o escape no restante quando você aprovar.
- **Fase 4A**: cada carregamento de tela faz umas 16 chamadas à API e o limite é 200 por minuto por IP; se estourar (muitas abas/aparelhos na mesma internet), a resposta 429 em `/auth/me` **desloga** a pessoa (comportamento antigo do site). Sugestão futura: tratar só 401 como sessão expirada.
- O **recibo de venda** monta HTML com nome/CPF/observação sem escapar caracteres especiais. O orçamento novo já escapa. Vale aplicar o mesmo escape no recibo de venda (não mexi para não alterar o layout aprovado). **O recibo de OS foi corrigido na Fase 3**: tudo que o usuário digita é escapado (testado com `<img onerror>`).
- O limite geral da API é 200 requisições por minuto por IP; o Kanban com avisos e histórico faz algumas chamadas a mais, mas é folgado para uso normal.
- `GET /devices` devolve o **custo** de todos os aparelhos para qualquer usuário logado (vendedor/técnico). A tela esconde, mas a API entrega. Não alterei por não ter sido pedido e para não quebrar telas; vale corrigir depois. (Na Fase 4A os endpoints NOVOS já respeitam "ver custo": ficha do fornecedor, por exemplo.)
