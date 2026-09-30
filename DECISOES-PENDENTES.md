# Decisões pendentes e observações

Anotações feitas durante a implementação da paridade com o sistema M7 Concept
(branch `feat/paridade-m7`). Tudo aqui é para você revisar quando voltar.
Nada foi enviado ao GitHub nem colocado em produção.

## LEIA PRIMEIRO — o que você precisa decidir/fazer antes de usar em produção

Esta é a última fase (5B). O trabalho está pronto e testado (contra ambientes locais/falsos), mas
NADA foi testado contra os serviços externos reais (Uazapi e Gemini) nem em produção. Antes de ligar
para valer:

1. **IA (Gemini) — ative com cuidado, nesta ordem:**
   - Cadastre a chave real em **Configurações › Variáveis › `GEMINI_API_KEY`** (ou defina a variável de
     ambiente `GEMINI_API_KEY` no servidor). Sem isso a IA fica bloqueada em toda parte, com aviso claro.
   - Abra **IA Atendimento › Base de conhecimento** e cadastre pelo menos: política de garantia, formas de
     pagamento, endereço/horário e (se quiser que a IA cote troca) uma política de troca com faixas de valor.
   - Revise os **guardrails** (regras que a IA sempre segue) e o **tom de voz** em IA Atendimento › Configuração.
   - Teste bastante no **Simulador** (não envia nada) com perguntas reais do seu dia a dia antes de ligar
     qualquer coisa.
   - Ligue o interruptor **"IA ligada"** primeiro com **envio automático DESLIGADO** (é o padrão): toda
     resposta cai na fila **Revisão da IA** (aba do CRM) para você aprovar/editar/descartar. Só depois de
     confiar no que ela responde, considere ligar o **envio automático** (a tela pede confirmação e mostra
     um aviso; o interruptor geral desliga tudo na hora, a qualquer momento).
   - **A API real do Gemini não foi testada nenhuma vez** (não existe chave de teste aqui). O formato da
     chamada segue a documentação pública do Gemini (`generateContent`, `x-goog-api-key`, `systemInstruction`,
     `responseSchema`), mas só uma chamada real vai confirmar se está tudo certo. Se o formato real divergir,
     o sintoma será "IA: O Gemini recusou o pedido" ou "formato inesperado" no Simulador — me chame com a
     mensagem de erro exata.
2. **Uazapi (WhatsApp) real**: como nas fases 3/4B/5A, o envio de mensagens (inclusive as respostas da IA)
   nunca foi testado contra o Uazapi de verdade, só contra um servidor falso local. Teste um envio manual
   simples antes de confiar no envio automático da IA.
3. **Revise a matriz de permissões** (Usuários › "O que cada cargo pode"): a Fase 5B criou duas capacidades
   novas — `useAI` (vendedor, gerente, admin: sugerir e revisar) e `manageAI` (gerente, admin: configurar,
   base de conhecimento, simulador e métricas). Se preferir outra combinação, é mudar a matriz (nos dois
   arquivos, front e servidor — há teste que garante que ficam iguais).
4. **Decisões antigas ainda pendentes** (fases 3–5A) continuam listadas mais abaixo, na seção
   "Pendências que dependem de você" — nada delas foi resolvido nesta fase.
5. **Ambiente de teste**: como sempre, tudo aqui rodou contra o Postgres local descartável (porta 54329) e
   servidores falsos locais para Uazapi e Gemini. Nenhum dado real de cliente foi usado.

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

### Fase 4B — Conferência financeira, Planejamento e Relatórios
- **Conferência**: fica como aba do BI (não página própria). Status e observação ficam **no próprio pagamento** (`payments.audit_status/audit_note/audited_by/audited_at`); pagamentos antigos = "Aguardando". Voltar a "Aguardando" **limpa quem/quando** (o histórico fica na Auditoria; a observação é mantida). Repetir o mesmo status não regrava quem/quando nem gera auditoria. Lote por filtro é limitado a **5.000 pagamentos** (o servidor recusa com aviso). Só o que muda de status é gravado no lote; a observação do lote vale para os que mudaram.
- **Venda devolvida**: fica **fora** da lista, dos cartões e do lote; alterar o pagamento dela pela API responde 409.
- **Editar a forma de pagamento da venda** (Vendas > Editar) recria o pagamento: se for exatamente o mesmo (forma, valor e parcelas) a conferência é mantida; se mudou, volta a **Aguardando**.
- **Quem vê o quê na conferência**: só admin/gerente/financeiro (capacidade nova `reconcile`, nos dois módulos de permissões e no teste de paridade). Quem tem acesso às vendas (vendedor, por exemplo) vê o **status** no detalhe da venda, mas **não** a observação nem quem conferiu (o servidor remove esses campos de `GET /sales/full`).
- **Planejamento — capacidade `managePlanning`** (admin e gerente) passou a valer (era reservada). A tela é aberta a **todos** os logados; quem não gerencia só vê e conclui as **próprias** tarefas. Dá para deixar tarefa **sem responsável**.
- **Lembrete no sistema**: o servidor entrega uma vez, quando a pessoa consulta `GET /notifications/summary` (a cada 60 s, ao abrir o sistema ou ao voltar para a aba) e já marca como entregue. Se a pessoa não estiver com o sistema aberto na hora, o lembrete chega quando ela abrir. Tarefas **concluídas** não avisam. **Se você desligar os avisos em Minha conta**, o aviso na tela (toast) do lembrete ainda aparece; só a notificação do navegador e o bipe respeitam a preferência.
- **Lembrete por WhatsApp**: enviado na hora quando o lembrete é "agora" (ou já venceu) e, para lembretes futuros, por um **agendador do servidor que roda a cada minuto** (atraso de até ~1 min). Cada tarefa tenta **uma vez** (não reenvia sozinha); o botão **Lembrar agora** reenvia. Usa a **primeira instância de WhatsApp ativa e conectada** (mesma regra dos avisos de OS). O resultado fica no cartão: enviado, sem telefone, sem número/desconectado ou falha. Trocar o responsável ou o horário do lembrete reinicia o lembrete. Como o agendador roda dentro da API, **só há um por API** (se você rodar mais de uma cópia da API, o envio pode duplicar).
- **WhatsApp do colaborador**: guarda só os dígitos (DDD + número, 10 a 13). Aparece em Usuários (admin) e some de qualquer outra resposta: a lista de responsáveis do planejamento só diz se **tem** ou **não tem** telefone.
- **Relatórios — quem entra**: `viewReports` **continua incluindo o estoquista** (ele já tinha por causa do relatório de estoque da Fase 1/4A), embora o pedido dissesse admin/gerente/financeiro. Para não dar acesso a dados que ele não vê, **cada relatório exige também a capacidade dos seus dados**: o estoquista vê só Estoque, Ordens de Serviço e Garantias. Se preferir tirar o estoquista da Central, é remover `viewReports` dele nos dois módulos de permissões.
- **Nenhum cargo tem `viewReports` sem `viewCost`** hoje (admin, gerente, financeiro e estoquista veem custo). A regra de esconder custo nos arquivos existe e foi testada (unitários e no navegador, removendo `viewCost` do cargo só na memória do navegador), mas se você criar um cargo que veja relatórios sem ver custo, ela já funciona.
- **Resultado do relatório Financeiro** = receita (pagamentos das vendas não devolvidas do período) − custo dos produtos (só com `viewCost`) − despesas do período. **Sangrias** e **contas a pagar/receber** aparecem como informação e **não** entram no resultado. Contas entram pela data de **vencimento** no período.
- **Estoque**: por padrão os **vendidos ficam fora** (como nas outras telas de estoque); dá para incluir pelo filtro de status. Margem = (venda − custo) ÷ custo, igual às telas de aparelhos/acessórios.
- **Orçamentos**: para o relatório funcionar, a **leitura** de orçamentos (`GET /quotes`) foi liberada ao **financeiro** (antes só quem vende lia). Criar/editar/excluir continua só para quem vende.
- **PDF**: usa a fonte padrão do PDF (só caracteres latin-1): acentos saem certos, mas **emoji e símbolos fora disso são removidos** (o slogan "Sua loja no ❤️ de SP" sai "Sua loja no de SP" no PDF). Trocar por uma fonte com emoji exigiria embutir uma fonte no PDF (deixa o arquivo maior). O Excel e o CSV mantêm o texto original. As bibliotecas do PDF (jsPDF) só são baixadas quando alguém exporta.
- **Volume**: as telas de relatório usam os dados que o sistema já carrega (aparelhos, vendas, clientes, OS). Numa loja com muitos anos de vendas isso pode ficar pesado; o relatório de **Conferência** já busca direto no servidor (até 20 mil linhas por exportação).
- **Auditoria de tarefas**: registro de criação, exclusão e "Lembrar agora"; editar/arrastar/concluir **não** registram (é fluxo do dia a dia).
- **Menu**: "Relatórios" e "Planejamento" ficam logo após "BI Financeiro". O teste de menu por cargo da Fase 4A foi atualizado por essa mudança intencional.

### Fase 5A — CRM: funil, agenda, respostas rápidas e automáticas
- **Uazapi REAL não testado.** O webhook, o envio da resposta automática e o parser foram testados só contra um servidor HTTP **falso** local (rotas `/instance/status` e `/message/text`) e contra payloads que eu montei. **Suposição documentada no código** (`server/src/lib/webhookParser.ts`): o Uazapi manda `{ EventType: "messages", owner, message: { chatid, sender, senderName, fromMe, isGroup, messageid, messageType, text/content, wasSentByApi, messageTimestamp } }`; também aceito o estilo Evolution/Baileys (`data.key.remoteJid`, `message.conversation`…) e listas. Se o formato real for outro, mensagens deixam de virar lead/resposta **sem quebrar nada** (o webhook responde 200). **Teste com uma mensagem real e, se preciso, ajuste o parser** (há testes para cada formato). Ids do tipo `@lid` (WhatsApp novo) só funcionam se o payload trouxer o telefone em `sender_pn`; sem isso a mensagem é ignorada.
- **Webhook público**: `POST /whatsapp/webhook/:segredo`. O segredo (192 bits, aleatório por número) é comparado em **tempo constante**; inválido = **404** sem detalhes. Corpo de até **256 KB** (acima = 413); JSON quebrado, tipos errados ou content-type estranho = **200** e a mensagem é ignorada; falha interna = 200 + log no servidor (nunca 500 ao provedor). Limite próprio de 600 requisições/min por IP (o geral da API é 200). O segredo só é mostrado ao **dono do número e a quem gerencia WhatsApp**; **regenerar** invalida o anterior e fica na auditoria. O segredo não entra em backup, auditoria nem lista de números para os demais cargos.
- **Resposta em segundo plano**: o webhook grava a mensagem/lead/disparo e responde 200 na hora; o envio da resposta ao Uazapi acontece logo depois (o resultado — enviado, desconectado, recusado — atualiza o disparo). Se a API cair no meio, aquele disparo fica "Enviando" (sem erro) e conta para o intervalo mínimo por 60 min.
- **Idempotência** pelo id da mensagem do provedor por número (índice único em `message_logs`); sem id, uso uma impressão digital (telefone + texto + horário) **só se** o payload trouxer horário. A serialização por telefone (uma fila em memória) vale para **uma única cópia da API** (mesma limitação do agendador da 4B): com duas cópias, mensagens simultâneas do mesmo cliente podem gerar lead duplicado.
- **Casamento de telefone** (lead × cliente × orçamento × webhook): ignora formatação, o 55 e completa o 9º dígito de celular antigo (10 dígitos começando em 6-9). Telefone com menos de 10 dígitos nunca casa. Lead criado pelo webhook guarda "(11) 98888-7777" e o nome do contato (`senderName`/pushName, até 120 caracteres) ou o próprio telefone.
- **Regras**: menor número = mais prioritária; empate mantém a ordem de criação. **Regra que casa mas está fora do horário/período é PULADA** (a próxima que casar e estiver no horário vence) — isso permite ter duas regras para as mesmas palavras, uma "no horário" e outra "fora do horário". **Cooldown NÃO passa para a regra seguinte**: se a vencedora já respondeu a esse telefone há pouco, nada é enviado. Cooldown é por regra + telefone e conta respostas enviadas e em andamento; cooldown 0 desliga. Disparos só são gravados quando a regra vai mesmo tentar responder (casou + no horário + fora do cooldown); regra que casa fora do horário/cooldown não gera linha em "disparos" (o simulador explica). Fim de faixa de horário é **exclusivo** (09:00–19:00 responde até 18:59; "23:59" vale até o fim do dia); faixa com início maior que o fim atravessa a meia-noite e vale para o dia em que começou.
- **Palavras-chave**: por padrão casa a **palavra inteira** (ou frase inteira) sem acento/maiúsculas e ignorando pontuação; `*` no fim/começo libera pedaço da palavra (`garant*`, `*fone*`). Emoji e símbolos são ignorados. Não há sinônimos nem correção de erro de digitação (a IA da 5B pode cobrir isso).
- **Variáveis** dos modelos: sem nome, `{nome}`/`{primeiro_nome}` viram "cliente". Em modelo de **várias linhas**, a linha com `{modelo}`, `{endereco}` ou `{chave_pix}` sem valor **some**; em modelo de **uma linha só**, a variável vazia vira vazio e os espaços/pontuação sobrando são arrumados (ex.: "o preço é {modelo}." vira "o preço é."). Variável desconhecida fica como escrita.
- **Cópias duplicadas com teste de paridade** (`src/test/crmSync.test.ts`, que compara o **texto** dos arquivos e roda os mesmos casos nas duas): `crmText.ts` (telefone e variáveis) e `keywordRules.ts` (motor). Ao mudar um, altere os dois. O parser do webhook existe só no servidor.
- **Permissões**: reaproveitei `useCRM` (ver/usar/simular) e `manageAutomations` (admin e gerente: criar/editar/excluir/ordenar regras e respostas rápidas) — **nenhuma capacidade nova**, então a matriz de permissões não mudou (só o rótulo de `manageAutomations` ficou mais claro). Horário comercial e configuração da agenda usam `editSettings` (admin e gerente) para gravar e qualquer usuário logado para ler (setting novo em `app_settings`: `business_hours` e `crm_agenda`). O vendedor **continua podendo** adicionar/remover/reordenar etapas do funil e criar/editar leads (como antes; a 5A não restringiu).
- **Funil**: remover etapa agora só se estiver **vazia** (antes os leads iam para a primeira etapa) e nunca a última; nomes de etapa únicos (sem diferenciar acento/maiúsculas, 409). A cor precisa estar no formato "H S% L%". Lead criado sem etapa entra em **"Novo Lead"** (ou na primeira etapa, se o banco antigo não tiver essa). Nas instalações antigas as etapas Novo/Contatado/Negociação/Convertido/Perdido continuam como estão.
- **Integração Orçamentos/Vendas**: além de "criar/enviar orçamento" e "converter em venda", **qualquer venda** para um cliente que é lead leva o lead a Venda Concluída (não só a vinda de orçamento). Mudar o orçamento para Aprovado/Recusado não mexe no funil. Orçamento editado depois não reavalia o telefone.
- **Agenda**: 100% calculada no navegador com os dados que a tela já carrega (sem endpoint próprio), datas no fuso de São Paulo. Sugestões: aniversário (hoje até +6 dias); compra (última compra do cliente há ≥ N dias, até `purchaseMaxDays`=365, sem mensagem — enviada **ou recebida** — para o telefone dele depois da compra); orçamento (status **Enviado** há ≥ N dias contando da última alteração do orçamento — editar o orçamento "renova" o prazo — e sem mensagem depois); garantia (vence de hoje até +N dias; um item por produto vendido). Sugestão vira tarefa (com `source_key`) e some; "já entrei em contato" cria uma tarefa **concluída** com a mesma chave. Sugestão só aparece para o vendedor em "Minhas" se o telefone for de um lead dele (dono do lead) ou se ele for o vendedor da venda/orçamento (comparação por nome). "Concluída" não conta para o contador do aviso de tarefas vencidas.
- **Respostas rápidas padrão**: semeadas uma vez (marcador `quick_replies_seeded` em `app_settings`), só se a tabela estiver vazia; se você apagar todas depois, **não** voltam. O texto padrão de endereço/atendimento cita "segunda a sábado, das 9h às 19h" — ajuste se o horário da loja for outro.
- **Respostas "Automático" antigas** (pós-venda e reativação diárias) continuam iguais, na aba **Automático**; as novas ficam em **Respostas automáticas**. São coisas diferentes (uma dispara por calendário, a outra responde a mensagens recebidas).
- **Mensagens novas**: o contador é **global** (todos os usuários com CRM veem o mesmo número de mensagens recebidas ainda não abertas); abrir a conversa/histórico de um lead marca todas as dele como lidas. Leads e mensagens do CRM se atualizam sozinhos a cada 30 s na tela do CRM.
- **Histórico**: o CRM carrega as 5.000 mensagens mais recentes (`GET /message-logs`); depois disso as mais antigas somem da tela (continuam no banco/backup). Backup passou a incluir respostas rápidas, regras e disparos (nunca o segredo do webhook nem a chave dos números).
- **Simulador**: aceita simular outro dia/horário (campo opcional) — só para conferir o agendamento; o telefone informado permite ver o **intervalo mínimo** real daquele cliente.

### Fase 5B — IA (Gemini) no atendimento
- **API real do Gemini NÃO testada.** Não há chave de teste do Google disponível neste ambiente. Todo o
  desenvolvimento e todos os testes automatizados rodaram contra um **servidor Gemini falso** local
  (`GEMINI_BASE_URL`), que valida o formato da chamada (caminho `/v1beta/models/<modelo>:generateContent`,
  cabeçalho `x-goog-api-key`, corpo com `systemInstruction`/`contents`/`generationConfig` com
  `responseMimeType: "application/json"` e `responseSchema`) e simula respostas válidas, JSON quebrado,
  bloqueio de segurança, 429/500 (com 1 nova tentativa) e timeout. **O formato foi montado com base na
  documentação pública do Gemini, o melhor possível, mas não foi confirmado contra o serviço de verdade.**
  Antes de confiar, teste no Simulador com a chave real e veja se a resposta chega e se o formato bate.
- **LGPD — nota obrigatória**: o texto da pergunta do cliente (sem CPF/CNPJ/e-mail/telefone/CEP/endereço,
  removidos automaticamente por `server/src/lib/aiPrivacy.ts`) é enviado ao **Google (Gemini)** para gerar a
  resposta. Isso é uma transferência de dados a um terceiro (ainda que anonimizado o melhor possível) — se a
  sua política de privacidade/termos de uso do WhatsApp da loja não mencionar isso, vale atualizar. O que é
  enviado: a pergunta redigida do cliente, o histórico recente da conversa (mesma poda de dados pessoais),
  o modelo/capacidade/cor/condição/bateria/preço de venda dos aparelhos do estoque, e trechos da sua base de
  conhecimento. **Nunca** são enviados: custo, margem, fornecedor, IMEI/serial, CPF, e-mail, endereço, ou
  dados de OS de um cliente diferente do telefone que perguntou. O registro interno da IA (`ai_events`,
  usado para métricas e auditoria) guarda a MESMA versão sem dados pessoais — nunca o texto original.
- **A IA nunca inventa preço** (pedido explícito): qualquer valor em R$ citado na resposta que não apareça
  no estoque disponível nem na base de conhecimento ativa faz a resposta ser sinalizada (confiança rebaixada
  para no máximo 40% e `needsHuman`), então ela some da fila de auto-envio e cai na revisão. Isso é uma
  checagem determinística (regex + comparação numérica), não depende da IA "se comportar".
- **Avaliação de troca**: por padrão a IA NUNCA cota valor de troca sozinha (sempre encaminha para um
  humano). Só passa a poder citar faixas de valor se você cadastrar um documento na base de conhecimento
  com a etiqueta relacionada a "troca"/"avaliação" e o conteúdo com as faixas — mesmo assim o prompt instrui
  a dizer que o valor final depende de avaliação presencial.
- **Consulta de OS por WhatsApp**: só confirma a situação (status, sem previsão de prazo — não existe esse
  campo hoje) quando o telefone de quem pergunta bate com o telefone da OS ou do cliente cadastrado, ou o
  CPF informado bate E o telefone também bate. Sem isso, ou sem número/CPF na pergunta, a resposta diz que
  "não consegui confirmar, um atendente vai verificar" e não vaza nada (nem para dizer "existe uma OS" ou não).
- **Limites de segurança**: `autoSend` (envio automático) vem **desligado por padrão** (só liga com
  confirmação na tela); limite de **3 respostas automáticas por telefone por hora** (configurável);
  interruptor geral **"IA ligada"** funciona como kill-switch (desligado = nem sugestão nem regra automática
  geram nada, mesmo com a chave cadastrada); a IA nunca responde a mensagens `fromMe` nem de grupo (mesma
  regra do webhook da 5A). Falha ao enviar automaticamente (ex.: WhatsApp desconectado bem na hora) não perde
  a resposta: ela cai na fila de revisão com o motivo.
- **Base de conhecimento (RAG) é busca por palavras (BM25), sem embeddings**: cada documento é quebrado em
  trechos de ~800 caracteres com sobreposição; a busca usa texto normalizado (sem acento/maiúsculas) mais um
  pequeno dicionário de sinônimos em português (ex.: "parcelar/cartão" → pagamento; "cobre/defeito" →
  garantia) e reforço por título/etiquetas. Não há correção de erro de digitação nem embeddings semânticos:
  perguntas com palavras muito diferentes das do documento podem não achar o trecho certo — nesse caso, ou
  aumente as etiquetas do documento, ou revise/adicione o texto. **Cópia duplicada com teste de paridade**
  (`server/src/lib/aiRetrieval.ts` = `src/lib/aiRetrieval.ts`, `src/test/aiRetrieval.test.ts` compara e roda
  os mesmos casos nas duas), porque o front usa a mesma busca em "Testar busca" da base de conhecimento.
- **Não semeei nenhum documento de exemplo** na base de conhecimento (o pedido dizia "não semear preços
  inventados; se semear, marcar claramente como exemplo e inativo" — decidi não semear nada para não haver
  risco de um texto de exemplo ser usado sem revisão). A base começa vazia; cadastre o que fizer sentido.
- **Estoque no prompt**: só aparelhos com status **Disponível**; se a pergunta citar um modelo específico
  (com ou sem espaço, ex. "iphone15" ou "iphone 15"), mostra até 8 unidades desse modelo (a mais específica:
  "15 Pro Max" não mistura com "15 Pro"), com filtro por capacidade/condição se citados; sem preço de venda
  cadastrado, a linha diz "preço sob consulta (não informar valor)" — nunca usa o custo. Sem citar modelo,
  mostra um resumo "a partir de" por modelo+capacidade (só com o menor preço de venda existente).
- **Sugerir na conversa (`useAI`) x gerenciar a IA (`manageAI`)**: o vendedor sugere/usa/revisa respostas,
  mas não vê o prompt enviado ao Gemini nem mexe em configuração/base de conhecimento/simulador/métricas
  (só admin e gerente). O prompt completo só aparece no **Simulador**, para depuração.
- **Regra "IA" nas Respostas automáticas (5A)**: liguei o gancho `registerAiReplyGenerator` que a Fase 5A já
  tinha deixado pronto (`server/src/services/keywordReplies.ts`); a opção "Em breve: IA (Fase 5B)" no
  formulário virou "Responder com IA (Gemini)" com um seletor do tipo de atendimento. Não toquei no webhook
  em si (`whatsappWebhook.ts`) nem no motor de regras (`lib/keywordRules.ts`) — só o `deliver()` de
  `inboundWhatsapp.ts` ganhou os três desfechos possíveis do gerador de IA (enviar, ir para revisão, erro).
- **Cooldown da regra e limite por hora da IA são coisas diferentes**: o cooldown (intervalo mínimo entre
  respostas da MESMA regra ao MESMO telefone, da 5A) continua valendo antes de a IA ser chamada; o limite de
  respostas automáticas por hora é um limite adicional, só da IA, e conta especificamente os envios
  automáticos (não os que foram para revisão).
- **Migration**: a `0029` cria `ai_documents`, `ai_events`, `ai_reviews` e as colunas `ai_kind` (em
  `keyword_rules`) e `review_id` (em `keyword_rule_hits`). Não altera nem apaga nada existente.
- **Backup**: passou a incluir a base de conhecimento (`ai_documents`) e os eventos/revisões da IA
  (`ai_events`, `ai_reviews`); a chave `GEMINI_API_KEY` nunca sai no backup (é uma variável customizada,
  já excluída do backup desde a Fase 4A).
- **Auditoria**: registra alteração de configuração da IA (com destaque quando liga/desliga a IA ou o envio
  automático), criação/edição/ativação/exclusão de documentos da base de conhecimento e cada
  aprovação/edição/descarte na fila de revisão.

## Pendências que dependem de você
- **Fase 4A: revisar a matriz de permissões** (Usuários > "O que cada cargo pode") e o endurecimento do técnico (9 rotas de API que ele não usava).
- **Fase 4A, em produção**: definir `SETTINGS_ENC_KEY` (chave para cifrar variáveis) antes de cadastrar variáveis; confirmar que o banco é UTF8; a migration `0026` roda sozinha no deploy (cria fornecedores, os 3 cargos novos e converte os fornecedores já digitados nos aparelhos).
- **Fase 4A, testar em aparelhos reais** (não foi possível aqui): notificação nativa do navegador e bipe (os testes usaram espiões), Alt+L e bloqueio de tela no celular/tablet, "Copiar" valor de variável no navegador da loja.
- **Fase 4A, decidir**: se trocar a senha deve derrubar as outras sessões e se quer limpeza/retenção da auditoria.
- **Fase 4B, decidir**: se o estoquista deve mesmo ter a Central de Relatórios (hoje vê 3 relatórios); se o WhatsApp de lembrete deve reenviar sozinho em caso de falha; se quer que "editar/arrastar tarefa" também apareça na Auditoria.
- **Fase 4B, testar em aparelhos reais** (não foi possível aqui): o **envio real** de WhatsApp pela Uazapi (os testes usaram um servidor falso) e a notificação nativa/bipe do lembrete (espiões). Abrir os PDFs exportados na impressora/visualizador da loja e conferir o layout com o **logo real**.
- **Fase 4B, em produção**: a migration `0027` roda sozinha no deploy (colunas novas em pagamentos e usuários e a tabela de tarefas); cadastrar o WhatsApp dos colaboradores em Usuários; manter **uma única cópia da API** rodando (o agendador de lembretes fica nela).
- **Fase 5A, testar com o Uazapi REAL (não foi possível aqui)**: configurar o webhook no painel do Uazapi com a URL da aba **Conectar WhatsApp**, mandar uma mensagem de outro número e conferir se o lead aparece e a resposta sai. Se não aparecer, me passe um exemplo do payload que o Uazapi enviou (o parser é pequeno de ajustar). Confirmar também se o Uazapi aceita o corpo de `/message/text` já usado (é o mesmo do resto do sistema).
- **Fase 5A, em produção**: a migration `0028` roda sozinha no deploy (tabelas `quick_replies`, `keyword_rules`, `keyword_rule_hits`; colunas novas em mensagens, tarefas e números de WhatsApp; gera o segredo do webhook dos números que já existem); a **URL da API precisa ser acessível pela internet** (o Uazapi chama de fora); manter **uma única cópia da API** (fila por telefone e agendador em memória); as etapas do funil de um banco antigo só mudam se alguém clicar em **Restaurar etapas padrão**.
- **Fase 5A, decidir**: o horário comercial padrão (seg–sáb 9–19) e os textos das respostas rápidas padrão (citam o horário e "Av. Paulista" pelo endereço da loja); se o vendedor deve poder mexer na estrutura do funil (hoje pode, como antes); se a resposta automática deve ficar fora do ar durante conversa já em andamento com humano (hoje só o intervalo mínimo por regra evita repetição).
- **Fase 5B, testar com o Gemini REAL (não foi possível aqui)**: cadastrar a chave de verdade e testar no Simulador antes de confiar em qualquer coisa; comparar o formato real da resposta com o que o código espera (ver nota no topo deste arquivo). Testar também um envio de WhatsApp real de uma resposta da IA (aprovada na revisão ou automática).
- **Fase 5B, decidir**: se `useAI` (sugerir/revisar) deve realmente incluir o vendedor (hoje inclui, pelo pedido de "sugerir resposta na conversa"); se quer restringir ainda mais quem liga o `autoSend` (hoje qualquer um com `manageAI`, ou seja, admin/gerente); os guardrails padrão e o tom de voz padrão (revise o texto e ajuste à realidade da loja); se quer cadastrar desde já uma política de troca com faixas de valor (sem isso, a IA nunca cota troca).
- **Fase 5B, em produção**: a migration `0029` roda sozinha no deploy (tabelas `ai_documents`, `ai_events`, `ai_reviews`, colunas `ai_kind`/`review_id`); definir `GEMINI_API_KEY` (variável cifrada ou de ambiente) só quando for realmente ativar; a base de conhecimento nasce vazia — cadastre os documentos da sua loja antes de ligar a IA.

## Observações de segurança encontradas
- **Fase 5A**: o webhook é uma das **poucas rotas públicas** (junto com o login) e a única que recebe dados de terceiros (segredo na URL). Riscos e defesas: segredo de 192 bits comparado em tempo constante; corpo limitado a 256 KB; parser que nunca lança e limita texto (4.000), nome (120) e 20 mensagens por chamada; tudo que chega é guardado como **texto puro** e exibido com escape do React (testado com `<img onerror>` e SQL). **Quem tiver a URL consegue injetar mensagens falsas** (por isso o botão Gerar novo segredo): não compartilhe. Não validamos nenhuma assinatura do provedor (não sei se o Uazapi oferece uma; se oferecer, vale adicionar). Resposta automática só sai pelo **mesmo número** que recebeu, e o cooldown por telefone limita repetição (proteção contra laço com outro robô).
- **Fase 4A**: o **recibo de venda** continua sem escapar nome/CPF/observação do cliente e a descrição dos itens (para não alterar o layout aprovado); os dados novos da loja e o texto do termo de garantia **são escapados**. Vale aplicar o escape no restante quando você aprovar.
- **Fase 4A**: cada carregamento de tela faz umas 16 chamadas à API e o limite é 200 por minuto por IP; se estourar (muitas abas/aparelhos na mesma internet), a resposta 429 em `/auth/me` **desloga** a pessoa (comportamento antigo do site). Sugestão futura: tratar só 401 como sessão expirada.
- O **recibo de venda** monta HTML com nome/CPF/observação sem escapar caracteres especiais. O orçamento novo já escapa. Vale aplicar o mesmo escape no recibo de venda (não mexi para não alterar o layout aprovado). **O recibo de OS foi corrigido na Fase 3**: tudo que o usuário digita é escapado (testado com `<img onerror>`).
- O limite geral da API é 200 requisições por minuto por IP; o Kanban com avisos e histórico faz algumas chamadas a mais, mas é folgado para uso normal.
- **Fase 4B**: as telas de relatório usam `GET /devices` (que entrega custo a qualquer logado) e só **escondem** o custo nos arquivos/telas; a API continua entregando. Endpoints novos (`/reconciliation`, `/planning`) respeitam capacidades; a lista de responsáveis do planejamento não expõe telefone.
- `GET /devices` devolve o **custo** de todos os aparelhos para qualquer usuário logado (vendedor/técnico). A tela esconde, mas a API entrega. Não alterei por não ter sido pedido e para não quebrar telas; vale corrigir depois. (Na Fase 4A os endpoints NOVOS já respeitam "ver custo": ficha do fornecedor, por exemplo.)
- **Fase 5B**: a chave `GEMINI_API_KEY` usa o mesmo mecanismo cifrado das variáveis customizadas (Fase 4A) e nunca aparece em `GET /ai/status`, `GET /ai/config`, no backup nem na auditoria (testado). O texto do cliente é enviado a um serviço externo (Google) — ver a nota de LGPD acima. `POST /ai/playground` (simulador) e `POST /ai/suggest` têm limite próprio de 30 requisições/minuto por IP (chamadas que custam dinheiro no Gemini de verdade); o registro de cada chamada (`ai_events`) guarda o texto JÁ sem dados pessoais, então mesmo um vazamento da tabela não expõe CPF/e-mail/telefone/endereço do cliente. A fila de revisão (`ai_reviews`) é visível a quem tem `useAI` (inclui vendedor) — ela mostra a pergunta e a sugestão, mas não dados de outros clientes fora daquela conversa.

## Relatório do dia + estoque separado (pedido do Edu Lima)
- "14" e "16 PM" fora do lugar: assumimos que são modelos digitados de forma diferente (ex.: "16 PM" = iPhone 16 Pro Max). Agora agrupam/ordenam junto do nome completo. Há a opção "Padronizar nomes de modelos" (Aparelhos > Mais ações) para gravar o nome correto no banco; é manual e opcional.
- Aparelhos: abas Lacrados / Seminovos / Vendidos. Estoque Geral: seções separadas e vendidos ocultos por padrão (botão "Mostrar vendidos").
- Valores separados: aparelhos lacrados, seminovos e acessórios (venda e custo). Acessórios têm Catálogo e Relatório de Estoque próprios para impressão.
- Relatório do dia (Vendas): identifica o aparelho pelo número de série (se faltar, o serial interno; nunca o IMEI). Vendas devolvidas ficam fora dos totais.
- Baterias antigas de UI (ui-fase1, ui-import, ui-print) esperam a lista única antiga e precisam de ajuste de contagem.

## Detalhes da venda: serial/IMEI, busca e número sequencial (pedido do cliente)
- Detalhes da venda agora mostram o nº de série e o(s) IMEI do aparelho vendido (busca no cadastro atual do aparelho; se ele foi excluído, usa o que foi salvo na venda).
- Busca em Vendas passou a aceitar: número da venda, nº de série do aparelho (além de nome, vendedor, produto e IMEI, que já existiam).
- Nova numeração sequencial da venda ("Nº 001", "Nº 002"...), mostrada na lista e nos detalhes. As vendas já existentes receberam número na ordem cronológica (mais antiga = Nº 1); as novas seguem a sequência automaticamente (coluna `sale_number`, sequência no banco).

## Aparelho de troca (parte de pagamento) no recibo
- O diálogo "Aparelho de Troca" no PDV agora tem campos separados de IMEI e Serial (antes era um campo único "IMEI / Serial").
- O recibo de venda e os "Detalhes da Venda" mostram, quando há troca: modelo, nº de série, IMEI e por quanto o aparelho entrou (valor da troca).
- Trocas registradas antes desta mudança só têm o campo antigo (que foi salvo como IMEI); não têm serial retroativo.
