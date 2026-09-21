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

## Pendências que dependem de você
_(preenchido ao longo das fases)_

## Observações de segurança encontradas
- O **recibo de venda** (e o recibo de OS) monta HTML com nome/CPF/observação sem escapar caracteres especiais. O orçamento novo já escapa. Vale aplicar o mesmo escape nos recibos antigos (não mexi para não alterar o layout aprovado).
- `GET /devices` devolve o **custo** de todos os aparelhos para qualquer usuário logado (vendedor/técnico). A tela esconde, mas a API entrega. Não alterei por não ter sido pedido e para não quebrar telas; vale corrigir depois.
