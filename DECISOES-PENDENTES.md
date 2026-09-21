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

## Pendências que dependem de você
_(preenchido ao longo das fases)_

## Observações de segurança encontradas
- O **recibo de venda** monta HTML com nome/CPF/observação sem escapar caracteres especiais. O orçamento novo já escapa. Vale aplicar o mesmo escape no recibo de venda (não mexi para não alterar o layout aprovado). **O recibo de OS foi corrigido na Fase 3**: tudo que o usuário digita é escapado (testado com `<img onerror>`).
- O limite geral da API é 200 requisições por minuto por IP; o Kanban com avisos e histórico faz algumas chamadas a mais, mas é folgado para uso normal.
- `GET /devices` devolve o **custo** de todos os aparelhos para qualquer usuário logado (vendedor/técnico). A tela esconde, mas a API entrega. Não alterei por não ter sido pedido e para não quebrar telas; vale corrigir depois.
