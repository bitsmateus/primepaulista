# Prime Paulista — Registro de Mudanças

Documento das alterações recentes do sistema de gestão. Versão atual: **v1.0.0**.

---

## 21/09/2026 — Paridade com o sistema M7 Concept (em andamento)

Funções levadas do sistema M7 Concept para o Prime Paulista, mantendo o visual e a fonte atuais.

### Fase 1 — Estoque de aparelhos
- **Marca** e **Localização** (Estoque, Vitrine 1, Vitrine 2, Assistência ou qualquer outra) no cadastro, na busca, nos filtros e na exportação CSV.
- **Mover localização** pela linha do aparelho ou em lote (selecionando vários).
- **Filtros** por categoria, marca, condição (Lacrado/Seminovo), local e status.
- **9 ordenações**: modelo A-Z, modelos mais antigos → mais novos (e o inverso), maior/menor preço de venda, maior custo (admin), maior quantidade, maior bateria e entrada mais recente.
- **4 visões**: Lista, Por modelo (agrupada, com contador), Resumo (uma linha por modelo + capacidade + condição, com faixa de preço e média de bateria) e Grade.
- **Ficha do aparelho**: dados completos, fotos, vendas em que apareceu (cliente, vendedor, garantia) e histórico de movimentações. Custo e margem só para admin.
- **Leitor por câmera** (código de barras/QR/IMEI): nos campos IMEI 1, IMEI 2 e Serial, na busca de aparelhos, na busca de acessórios e no código do acessório. Sempre há o campo manual como alternativa (e serve para leitor USB).
- **Importação CSV e Excel (.xlsx)** com prévia linha a linha, validação de IMEI/serial duplicado (no estoque e no arquivo) e opção de substituir o estoque atual (exige digitar APAGAR; vendidos são sempre mantidos). Modelos de planilha para baixar em Excel e CSV.
- **Balanço de estoque**: confere aparelho por aparelho (câmera ou leitor), mostra progresso e a lista de faltantes (com download), por local. Admin inicia um novo balanço.
- **Zerar preço de venda de todos** (admin, exige digitar ZERAR).
- **Aparelho vendido não pode ser excluído** (fica no histórico permanente).
- **Acessórios**: botão +5 unidades na lista.
- **Auditoria**: importação, exclusão, mudança de local em lote, zerar preços e novo balanço ficam registrados (tela de consulta na Fase 4).

---

## 19/06/2026 — v1.0.0

- **Versão do sistema** exibida no rodapé do menu lateral (`Prime Paulista · v1.0.0`).

---

## 18/06/2026 — Auditoria completa e correções

Revisão de todo o sistema (segurança, finanças, interface e banco de dados) com correção de **todos os pontos** encontrados.

### Segurança
- **WhatsApp:** editar, excluir, gerar QR, desconectar ou reiniciar um número agora exige ser **o dono ou administrador**.
- **Anti-SSRF:** a URL da instância de WhatsApp passou a ser validada (somente `http(s)`).
- **Notas fiscais:** anexar e excluir NF restrito a **administrador**.
- **Vendas:** os totais (subtotal/total) são **recalculados no servidor** — não dependem mais do que o navegador envia.
- **Devolução:** só reabilita o aparelho se ele ainda estiver "Vendido" (evita venda dupla do mesmo IMEI).

### Financeiro (números corretos)
- **Lucro do mês anterior** agora é calculado pela mesma fórmula real (antes era um valor aproximado/placeholder).
- **Lucro do mês** desconta apenas as **despesas do mês** (não o histórico inteiro).
- **Composição de custos** passou a incluir o **custo de acessórios** (antes ignorado).
- Indicador "vs mês anterior" mostra "sem mês anterior" quando não há base de comparação.

### Desempenho
- **Índices** no banco nas tabelas mais consultadas (vendas, itens, pagamentos, leads, tarefas, movimentações de estoque).

### Interface / Usabilidade
- **Dashboard** deixou de mostrar margem/lucro/custo para vendedor e técnico (agora coerente com o resto do sistema).
- WhatsApp: troca de número **reseta o status/QR**; ao excluir o número selecionado o sistema **escolhe outro** automaticamente; exclusão com **confirmação**.
- Campanha: **confirmação antes do disparo** em massa e proteção contra intervalo inválido.
- Telas de Vendas e Garantias mostram **"Carregando…"** durante o carregamento.
- Contas a Receber/Pagar marcam **"atrasado" automaticamente** ao vencer.
- Diversos avisos de erro (toasts) e melhorias de acessibilidade.

---

## 18/06/2026 — 15 novas funcionalidades

### Financeiro
- **Lucro com custo real de acessório** e cálculo unificado entre Dashboard e BI.
- **Contas a Pagar** (nova aba no BI): cadastrar, marcar como pago, ver vencidas.
- **Devolução** deixa de contar no faturamento e no lucro.

### Vendas
- **Tela central de Vendas**: lista, filtros (período/vendedor/status), detalhe, **2ª via do recibo**, **editar venda** (dados) e **devolver/estornar** (admin).
- **Anexar Nota Fiscal** (PDF ou imagem) dentro da venda, com download.

### Estoque
- **Etiquetas com código de barras** para aparelhos (modelo, GB, bateria, cor, serial) e acessórios (nome, preço) — prontas para impressora térmica.

### Garantia
- **Consulta de garantia** por IMEI/cliente/modelo, mostrando até quando o aparelho está na garantia.
- Textos e prazos de garantia **centralizados** (fácil manutenção).

### Clientes
- **Importar clientes via CSV** com deduplicação por CPF/WhatsApp.

### CRM / WhatsApp
- **Múltiplos números de WhatsApp** (multinúmero), cada um com seu dono; todos enxergam todos.
- **Campanha** permite escolher de qual número sai o disparo e **anexar imagem com legenda**.
- **Filtro por vendedor** no funil ("Todos" / "Meus leads"; admin filtra por vendedor).
- **Tarefas/follow-up por lead** com lembrete e aviso de pendências do dia.
- **Métricas por etapa** do funil e indicador de lead que virou cliente ("Comprou").

### Permissões
- **Cargos na interface**: técnico sem PDV/Vendas/CRM; vendedor sem BI/Usuários; **custo e margem só para administrador**.

---

## 07–08/06/2026 — Revisões completas dos menus

Cada menu passou por revisão de bugs, testes, interface e novas ideias:

- **Frente de Caixa (PDV):** correção crítica (vendia pelo custo → agora pelo preço de venda), carrinho editável, troco, desconto geral (R$/%), atalho **F2**, busca avulsa de acessório e 2ª via do recibo.
- **Aparelhos:** filtros em dropdown, categorias customizáveis, **importar/baixar modelo CSV**, **fotos do aparelho**, preço de venda e margem, edição e confirmações de exclusão.
- **Acessórios:** filtros, busca, resumo, **preço de venda/margem**, edição e robustez.
- **Clientes:** edição, filtros, **histórico de compras**, aniversariantes, **exportar CSV**.
- **CRM:** editar lead, funil com resumo, campanhas com deduplicação e histórico, autoconexão de status.
- **Assistência:** "Nova OS" em pop-up, **dashboard com KPIs e gráficos**, editar OS, robustez.

---

> **Observação técnica:** após cada conjunto de mudanças é necessário **reimplantar a API e o front-end** no servidor (as migrações de banco rodam automaticamente na inicialização). Todas as alterações têm testes automatizados (149 testes passando).
