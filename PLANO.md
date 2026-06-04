# Plano de Desenvolvimento — Prime Paulista (Sistema de Gestão iPhone)

> Documento de escopo e cronograma. Base: protótipo Lovable (front-end pronto, backend a construir).
> Stack: Vite + React + TypeScript + shadcn/ui + Tailwind + Supabase (Postgres + Auth + Storage).
> Última atualização: 2026-06-03.

---

## 1. Diagnóstico do estado atual

| Camada | Situação |
|--------|----------|
| Front-end (telas dos 9 módulos) | ✅ Pronto (protótipo) |
| Modelagem de tipos (`src/types/`) | ✅ Boa base para o schema |
| Recibo Lacrado x Seminovo | ✅ Pronto (garantia 1 ano vs 90 dias) |
| Banco de dados (Supabase) | ❌ Conectado, mas SEM tabelas |
| Persistência (dados salvos) | ❌ Tudo em memória — F5 apaga tudo |
| Login / autenticação | ❌ Não existe |
| Permissões por cargo | ❌ Não existe |
| Upload de fotos (OS antes/depois) | ❌ Não existe |
| Disparo WhatsApp real | ❌ Só mock |
| RLS / segurança do banco | ❌ Não configurado (CRÍTICO antes de dados reais) |

**Conclusão:** o trabalho daqui pra frente é **dar vida ao que já existe** (conectar ao banco), não criar telas novas.

---

## 2. Decisões de arquitetura

- **Backend = Supabase** (já conectado). Postgres + Auth + Storage + RLS num lugar só, sem servidor para manter.
- **Camada de dados no front:** trocar os `useState` dos hooks por **React Query** (`useQuery`/`useMutation`) lendo/escrevendo no Supabase. A interface dos hooks (`addDevice`, `finalizeSale`, etc.) muda pouco — as telas quase não mudam.
- **Tipos:** os `src/types/*` viram o schema do banco e os tipos gerados do Supabase (`supabase gen types`).
- **Estado de UI** (carrinho do PDV, filtros) continua local. Só o que é **dado de negócio** vai pro banco.

---

## 3. Modelo de usuários e permissões (RBAC)

Tabela `profiles` ligada a `auth.users`, com coluna `role`.

| Cargo | Acessa |
|-------|--------|
| **admin** (dono) | Tudo: financeiro, BI, configurações, cadastro de usuários, exclusões |
| **vendedor** | PDV, estoque (ver/baixar), clientes, CRM, suas próprias vendas/comissão. **Não** vê custo de compra nem financeiro completo |
| **técnico** | Assistência (OS), estoque de peças. **Não** vê vendas/financeiro |

- Permissões reforçadas no banco via **RLS** (não só na tela — segurança real).
- Vendedores já mapeados no código: Gabriel, Matheus, Tassio → viram usuários reais.
- Comissão por vendedor já modelada em `SellerCommissionConfig` (device % e accessory %).

---

## 4. Schema do banco (tabelas principais)

Derivado de `src/types/`. Resumo das tabelas e campos-chave:

### Núcleo / Auth
- **profiles**: id (=auth.users), nome, role (admin/vendedor/tecnico), ativo
- **customers**: nome, cpf, whatsapp, aniversário, origem_lead, created_at

### Estoque
- **devices**: modelo, capacidade, cor, condição (Lacrado/Seminovo), saúde_bateria, fornecedor, custo, imei, serial_interno, status (Disponível/Vendido/Em Manutenção/Reservado)
- **accessories**: nome, categoria, subcategoria, modelo_compatível, qtd, qtd_mín, custo, preço, código_barras
- **stock_movements**: tipo (entrada/saída), produto, qtd, motivo, usuário, data → histórico de movimentações

### Vendas / PDV
- **sales**: cliente_id, vendedor_id, subtotal, desconto_troca, total, created_at
- **sale_items**: sale_id, tipo (device/accessory), ref_id, nome, serial, preço, qtd
- **payments**: sale_id, método (PIX/Dinheiro/Crédito/Débito), valor, parcelas
- **trade_ins**: sale_id, imei, modelo, descrição_saúde, valor

### Assistência técnica
- **service_orders**: cliente, aparelho (modelo/cor/imei/bateria), defeito_relatado, obs_técnicas, checklist (capa/chip/carregador), status, prioridade, custo_peça, mão_de_obra, valor_cobrado, impostos, datas
- **service_order_photos** *(NOVO)*: os_id, tipo (antes/depois), url_storage, created_at

### Comercial / CRM
- **leads**: nome, telefone, modelo_interesse, origem, status (coluna do funil), notas
- **funnel_columns**: nome, cor, ordem
- **message_logs**: destinatário, telefone, template, mensagem, enviado_em, status
- **campaigns** *(NOVO)*: nome, segmento, template, agendamento, status

### Financeiro
- **expenses**: descrição, categoria, valor, data, recorrente
- **sangrias**: valor, justificativa, data
- **accounts_receivable** *(contas a receber)*: venda_id, valor, vencimento, status
- **seller_commissions**: vendedor, device_percent, accessory_percent

### Storage (buckets)
- **os-fotos**: fotos antes/depois das OS (privado, acesso via RLS)
- **logos/recibos**: assets de recibo

---

## 5. Escopo por módulo

### Módulo 1 — Dashboard gerencial
- Cards: vendas do dia/mês, aparelhos em estoque, acessórios, contas a receber, recibos, OS abertas.
- Indicadores financeiros e comerciais lendo do banco (hoje calculam de mock).
- Filtro por período. Visível conforme cargo (vendedor vê versão reduzida).

### Módulo 2 — Estoque (aparelhos + acessórios)
- CRUD persistido. Entrada/saída gera registro em `stock_movements` (histórico).
- Filtro por modelo/categoria/tipo. Alerta de estoque baixo (já existe lógica `lowStockAccessories`).
- Status do aparelho muda automaticamente ao vender/abrir OS.

### Módulo 3 — CRM de prospecção
- Cadastro de leads, funil Kanban (já existe UI com drag-and-drop).
- Marcar quem comprou x não comprou (cruzar `leads` com `sales`/`customers`).
- Histórico de contato, interesse por modelo, etapa do funil.

### Módulo 4 — CRM automático
- Gatilhos: pós-venda (X dias após `sales`), reativação (cliente sem compra há N meses), acompanhamento de interessado.
- Implementado com **Supabase Edge Functions + cron** disparando via Uazapi.
- Mensagens segmentadas por perfil/interesse/status.

### Módulo 5 — Disparo em massa
- Seleção de segmento (comprou / não comprou / modelo de interesse).
- Template + envio em lote via Uazapi. Log em `message_logs`.
- Campanhas promocionais e avisos.

### Módulo 6 — Frente de caixa (PDV)
- Registro de venda (aparelho + acessório), múltiplos pagamentos, troca (trade-in).
- **Baixa automática no estoque** ao finalizar (lógica `finalizeSale` já existe — só persistir).
- Emissão de recibo (pronto). Histórico de vendas.

### Módulo 7 — Assistência técnica / OS
- Abertura de OS, Kanban de status (já existe), checklist, peças (do estoque ou avulsa).
- **NOVO: foto antes e depois** — upload no Supabase Storage, galeria na OS, aparece no recibo de entrega.
- Finalização e entrega com recibo de OS + garantia.

### Módulo 8 — Financeiro
- Contas a receber, recibos, entradas/saídas, sangrias.
- Fluxo de caixa diário (já modelado em `DailyCashEntry`).
- Relatórios e BI financeiro. Restrito a admin.

### Módulo 9 — Relatórios e BI
- Vendas, estoque, financeiro, clientes, assistência.
- Produtos mais vendidos, clientes que compraram x não compraram.
- Gráficos (recharts já no projeto). Exportação.

---

## 6. Recursos específicos pedidos

### ✅ Recibo: Lacrado vs Seminovo (JÁ PRONTO)
- `src/utils/receiptGenerator.ts` já diferencia:
  - **Lacrado** → "Garantia oficial Apple de 1 ano"
  - **Seminovo** → "Garantia NX de 90 dias contra defeitos de fabricação"
- Pendente: gerar o mesmo para **recibo de OS** (garantia do reparo, ex: 90 dias na peça).

### 🆕 OS com foto antes/depois
1. Bucket `os-fotos` no Storage (privado).
2. Tabela `service_order_photos` (os_id, tipo, url).
3. Componente de upload no `OSForm` (campo "Fotos de entrada" e "Fotos de saída").
4. Galeria na visualização da OS + miniatura no recibo de entrega.
5. Compressão da imagem no client antes de subir (economia de espaço).

---

## 7. Cronograma (sprints semanais)

| Sem | Entrega | Resultado prático |
|-----|---------|-------------------|
| 1 | Schema + RLS + Login + Perfis/Cargos | Equipe entra com login; permissões por cargo; dados têm onde ser salvos |
| 2 | Estoque real + histórico de movimentações | Cadastro de aparelho/acessório **persistido** |
| 3 | PDV + venda + baixa de estoque + recibo | Vender, emitir recibo, estoque baixa sozinho (MVP utilizável) |
| 4 | OS + **fotos antes/depois** + recibo de OS | Assistência técnica completa com fotos |
| 5 | CRM: leads + funil + comprou/não comprou | Gestão comercial persistida |
| 6 | WhatsApp Uazapi + disparo em massa | Campanha/pós-venda real |
| 7 | CRM automático (gatilhos + cron) | Mensagens automáticas |
| 8 | Dashboard + BI com dados reais | Indicadores de verdade |
| 9 | Financeiro (a receber, fluxo de caixa, sangria) | Visão de faturamento |
| 10 | Testes, ajustes, deploy | Sistema no ar |

> **MVP usável na semana 3.** Demais módulos entram sem parar a operação.

---

## 8. Riscos / pontos de atenção

- **RLS obrigatório** antes de subir dados reais — sem isso, a chave do `.env` dá acesso total ao banco.
- **Migração de dados:** os `sampleData` são fictícios; o estoque/clientes reais entram manualmente ou via importação (planilha) na semana 2.
- **Uazapi:** depende de instância WhatsApp ativa e número aquecido (evitar bloqueio por spam nos disparos em massa).
- **Backup:** ativar backups automáticos do Supabase desde o início.
- **LGPD:** dados de clientes (CPF, WhatsApp) — ter consentimento para disparos.

---

## 9. Próxima decisão

Quando for começar a codar, a Fase 0 (Semana 1) é sempre o ponto de partida:
1. Escrever as migrations SQL (schema completo).
2. Configurar RLS por cargo.
3. Montar tela de login + cadastro de usuários (admin cria os funcionários).
4. Refatorar o primeiro hook (`useInventory`) para Supabase como modelo dos demais.
