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
_(preenchido ao longo das fases)_

## Pendências que dependem de você
_(preenchido ao longo das fases)_

## Observações de segurança encontradas
- `GET /devices` devolve o **custo** de todos os aparelhos para qualquer usuário logado (vendedor/técnico). A tela esconde, mas a API entrega. Não alterei por não ter sido pedido e para não quebrar telas; vale corrigir depois.
