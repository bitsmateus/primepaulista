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

### Fase 2 — Vendas e orçamentos
- **Orçamentos** (novo menu, para admin e vendedor): monta a proposta com aparelhos e acessórios do estoque (preço editável, item avulso, desconto, validade de 7 dias, condições de pagamento), com número sequencial.
  - Lista com filtros (status, período, vendedor, busca por nº/cliente/telefone/produto) e resumo (em aberto, valor em aberto, convertidos, taxa de conversão).
  - Ações: editar, duplicar, imprimir/PDF, enviar por WhatsApp (abre a conversa com a proposta pronta e marca como Enviado), mudar status (Aberto, Enviado, Aprovado, Recusado; "Expirado" é automático pela validade) e excluir (admin ou quem criou).
  - **Converter em venda**: abre o PDV com cliente, itens, preço negociado, desconto e vendedor já preenchidos; itens que saíram do estoque ou ficaram sem saldo são avisados e não entram. Ao finalizar, o orçamento vira "Convertido" na mesma operação (não dá para converter duas vezes).
- **Novas formas de pagamento**: "Mercado Pago / Link de Pagamento" e "Outro / Verificação Externa" no PDV, na edição da venda, no fechamento de caixa e nos gráficos.
- **Vendas realizadas**: coluna e filtro de **origem** (Venda de balcão / De orçamento) e card **Lucro líquido acumulado** (admin) do período filtrado.
- **Dashboard**: **comparativo por vendedor** no período (qtd de vendas, faturamento, ticket médio e, para admin, lucro total e lucro por venda).

### Fase 3 — Assistência técnica (Ordens de Serviço)
- **Origem da OS**: "Aparelho do cliente" (como sempre) ou **"Estoque da loja"**. Na OS de estoque você busca o aparelho por modelo/IMEI/serial (só aparecem os não vendidos e que não estão em outra OS aberta); modelo, cor, IMEI e serial vêm do cadastro do aparelho e o cliente é opcional.
  - Ao abrir a OS, o aparelho vai automaticamente para **Em Manutenção** e local **Assistência** (a movimentação fica no histórico do aparelho). Ao **entregar/finalizar** ou **excluir** a OS aberta, ele volta para o status e o local em que estava. Se o aparelho foi vendido ou alterado nesse meio tempo, o sistema **não sobrescreve**.
  - Aparelho vendido ou já em outra OS aberta é recusado com mensagem clara. O custo do reparo **não** é somado ao custo do aparelho (o lucro da assistência já desconta a peça).
  - Selo "Estoque da loja" no cartão do Kanban, no detalhe, filtro por origem e coluna no CSV.
- **Quem paga o custo**: Cliente (padrão), **Garantia da Loja**, **Cortesia / Loja** ou **Dividido / Co-participação**.
  - Garantia e Cortesia: o valor cobrado do cliente fica travado em **R$ 0,00** (o servidor também zera) e o recibo sai como **R$ 0,00 (ISENTO - COBERTO PELA GARANTIA DA LOJA)** ou **(ISENTO - CORTESIA DA LOJA)**.
  - Dividido: o campo passa a se chamar "Parte paga pelo cliente" e o recibo mostra "Valor pago pelo cliente" + "Custo dividido com a loja".
  - A receita dos dashboards continua sendo o valor cobrado (sem contar em dobro); o custo das peças entra como antes. Filtro por "Quem paga" no painel.
- **Novos status**: **Em Diagnóstico** e **Aguardando Aprovação**. Colunas do Kanban: Aguardando Diagnóstico → Em Diagnóstico → Aguardando Aprovação → Aguardando Peça → Em Reparo → Pronto para Retirada → Entregue / Finalizado. Dashboards e filtros já contam os status novos.
- **Mensagens de WhatsApp editáveis** (nova aba **Mensagens** na Assistência):
  - O administrador edita o texto de cada aviso (Aguardando Aprovação, Pronto para Retirada, Entregue), liga/desliga cada um, define o nome da loja e a **chave PIX**, com **prévia em tempo real** e lista de variáveis clicáveis: `{cliente} {primeiro_nome} {os} {aparelho} {marca} {modelo} {imei} {valor} {loja} {chave_pix}`. O `{valor}` respeita "quem paga" (ex.: "R$ 0,00 (isento – coberto pela garantia da loja)").
  - Quando a OS muda para essas etapas, **o servidor** envia o aviso pelo WhatsApp já conectado (Uazapi). Sem telefone na OS, sem número conectado ou WhatsApp desconectado, a mudança de status **não quebra**: o aviso fica registrado como **Pendente** com o motivo; se o provedor recusar, fica como **Falhou**.
  - **Histórico de avisos**: lista geral (data, OS, cliente, aviso, status, motivo, com filtro) e o histórico de cada OS no detalhe, com botões **Notificar agora** e **Reenviar**. Vendedor e técnico veem o histórico e podem reenviar; só o administrador edita os modelos.
  - Filtro **Pendentes (N)** no painel: OS em Pronto para Retirada ou Aguardando Aprovação que ainda não tiveram aviso enviado com sucesso (cartão ganha o selo "Aviso pendente").
- **Base para as próximas fases**: armazenamento genérico de configurações da loja (`/settings/:chave`, só o administrador grava), já usado pelas mensagens.
- O aviso "pronto para retirada" que antes saía do navegador (só quando o CRM estava aberto e conectado) agora sai pelo servidor, com o texto editável.

### Fase 4A — Gestão: fornecedores, cargos, auditoria, configurações, conta e segurança
- **Fornecedores** (novo menu): cadastro com nome, CPF/CNPJ, telefone, e-mail, endereço e observações; busca; ativo/inativo; **ficha** com os aparelhos comprados, contas a pagar e **total comprado** (o total e os custos só aparecem para quem pode ver custo).
  - Fornecedor com aparelhos ou contas ligados **não é excluído**: o sistema avisa e oferece **inativar** (some das listas de escolha, o histórico continua).
  - No cadastro do aparelho, o campo Fornecedor virou **seleção com busca** e o botão **"Cadastrar novo fornecedor"** na hora. Quem não gerencia fornecedores (ex.: vendedor) ainda pode digitar um nome livre.
  - **Importação CSV/Excel** casa o fornecedor pelo nome (sem diferenciar maiúsculas) e cadastra sozinha os que faltam (a prévia avisa quais). **Contas a pagar** (BI) têm campo de fornecedor opcional.
  - Os fornecedores que você já tinha digitado nos aparelhos foram **convertidos em cadastros automaticamente** (uma vez só, sem duplicar).
- **Novos cargos**: **Gerente**, **Estoquista** e **Financeiro** (além de Administrador, Vendedor e Técnico). Na tela de Usuários há a tabela **"O que cada cargo pode"**.
  - **Gerente**: tudo do administrador, menos usuários/cargos e variáveis/backup. **Estoquista**: estoque completo, fornecedores e importação, vê custo; sem PDV/CRM/BI. **Financeiro**: BI, contas, despesas e relatórios, vê custo e lucro; estoque só para consulta.
  - A regra é a mesma no site e na API: o que o cargo não pode é **recusado pelo servidor** (não só escondido no menu). Trocar o cargo ou desativar alguém vale **na hora**, mesmo com a pessoa logada.
  - Administrador, vendedor e técnico continuam com o que já podiam. Única mudança: o **técnico** deixou de conseguir, pela API, criar venda e mexer no CRM/WhatsApp (as telas dele nunca mostraram isso).
- **Auditoria** (novo menu, para administrador e gerente; só leitura): quem fez o quê e quando, com filtros (período, usuário, ação, entidade, busca), paginação, detalhes em JSON e **exportar CSV**. Passaram a ser registrados: criar/editar/devolver venda, exclusões (aparelho, acessório, cliente, OS, orçamento, anexo, fornecedor), **mudança de custo/preço com antes → depois**, usuários (criar, cargo, ativar/desativar, redefinir senha), configurações, despesas/sangrias/comissões/contas, login (com sucesso e sem sucesso — **nunca a senha**) e troca da própria senha.
- **Configurações** (novo menu; administrador e gerente):
  - **Loja**: nome, slogan, WhatsApp, Facebook, Instagram, e-mail, endereço, CNPJ e chave PIX. Valem no recibo de venda, recibo de OS, orçamento, vitrine, catálogo e relatório de estoque. As mensagens de WhatsApp da assistência usam o nome e o PIX da loja quando os campos delas estiverem vazios.
  - **Logo**: envie PNG/JPG/WEBP (até 2 MB); o navegador reduz para até 512 px. Aparece no menu, no login e nos documentos impressos. Tem "Restaurar logo padrão".
  - **Termos de garantia**: prazos (lacrado, seminovo, bateria, serviço) e o texto do termo do recibo em blocos editáveis. Com os textos padrão o recibo sai **idêntico** ao de antes.
  - **Segurança**: bloqueio automático da tela por inatividade (minutos; 0 = desligado).
  - **Variáveis** (só administrador): chaves de integração (ex.: GEMINI_API_KEY) guardadas **cifradas** e **mascaradas**; "Mostrar valor" e "Copiar" ficam registrados na auditoria.
  - **Backup** (só administrador): exporta todos os dados em JSON (sem senhas e sem valores de variáveis) e restaura **apenas as configurações**.
- **Minha conta** (rodapé do menu): alterar a própria senha (senha atual, nova com 6+ caracteres e confirmação) e preferências de notificação.
- **Bloquear tela** (rodapé do menu ou atalho **Alt+L**): cobre o sistema até a pessoa digitar a própria senha; continua bloqueada mesmo recarregando a página; "Sair" funciona na tela bloqueada. Também bloqueia sozinha por inatividade, se configurado.
- **Notificações e alerta sonoro**: a cada 60 segundos (e ao voltar para a aba) o sistema confere OS prontas sem aviso, tarefas de leads vencidas/para hoje, orçamentos que vencem hoje, acessórios com estoque baixo e aparelhos parados há mais de 30 dias. **Só avisa quando algum número aumenta** (aviso na tela, notificação do navegador e um bipe curto), nunca na primeira carga nem repetindo o mesmo total. Cada usuário liga/desliga avisos e som em **Minha conta**.

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
