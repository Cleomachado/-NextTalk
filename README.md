# ZapConverte 🟢

> Nome comercial do produto: **ZapConverte** (a pasta mantém o codinome "Oxi Zap").

Sistema completo de automação de WhatsApp — **WhatsApp normal (não-oficial, QR code) + WhatsApp Cloud API oficial (Meta)** no mesmo produto. Recebe webhooks de plataformas de venda brasileiras e dispara automações humanizadas: texto, áudio de voz (PTT), **PTV (vídeo de bolinha)**, grupos com boas-vindas no privado e agentes de IA.

## Documentos

- **[PRD.md](PRD.md)** — o documento de produto completo: visão, módulos, taxonomia de eventos, arquitetura, modelo de dados, UI (cores do WhatsApp), roadmap e riscos.
- **[docs/GUIA-MONTAR-SISTEMA-WHATSAPP.md](docs/GUIA-MONTAR-SISTEMA-WHATSAPP.md)** — guia didático completo (zero → produção) para ensinar a montar a própria estrutura de sistema de WhatsApp.

### Pesquisa técnica ([docs/pesquisa/](docs/pesquisa/))

| Documento | Conteúdo |
|---|---|
| [evolution-api.md](docs/pesquisa/evolution-api.md) | Evolution API v2 — endpoints completos (sendPtv, sendWhatsAppAudio, grupos, `group-participants.update`, webhooks, deploy Docker) |
| [whatsapp-cloud-api-meta.md](docs/pesquisa/whatsapp-cloud-api-meta.md) | Cloud API oficial — templates, preços per-message Brasil, analytics de custo/entrega, janela 24h, Groups API, erros |
| [comparativo-apis-nao-oficiais.md](docs/pesquisa/comparativo-apis-nao-oficiais.md) | 10 APIs não-oficiais comparadas + veredito (Evolution principal, WAHA plano B) + estratégias anti-ban |
| [botconversa-zapi-uazapi.md](docs/pesquisa/botconversa-zapi-uazapi.md) | Estudo das 3 docs enviadas — BotConversa (CRM/fluxos), Z-API e UazAPI (endpoints de PTV/PTT/grupos/webhooks) |
| [webhooks-hotmart-kiwify.md](docs/pesquisa/webhooks-hotmart-kiwify.md) | Eventos, payloads, autenticação e retry — Hotmart e Kiwify |
| [webhooks-eduzz-perfectpay.md](docs/pesquisa/webhooks-eduzz-perfectpay.md) | Idem — Eduzz e Perfect Pay |
| [webhooks-ticto-braip.md](docs/pesquisa/webhooks-ticto-braip.md) | Idem — Ticto e Braip (Braip tem doc fechada; lacunas anotadas) |
| [webhooks-cakto-monetizze.md](docs/pesquisa/webhooks-cakto-monetizze.md) | Idem — Cakto e Monetizze |

## Decisões principais

1. **Motor não-oficial: Evolution API v2** self-hosted (Docker) — única open source gratuita que cobre PTV + PTT + presença "gravando" + webhook de entrada/saída de grupo + multi-instância.
2. **Driver abstraído (`WhatsAppGateway`)** desde o dia 1 — WAHA como plano B, Z-API/UazAPI como conectores opcionais.
3. **Cloud API oficial** para templates, escala e analytics de custo (per-message desde 07/2025).
4. **Fila em tudo** (Redis/BullMQ): webhook responde 200 na hora e processa async; envios com delay + jitter anti-ban.
5. **Taxonomia canônica de eventos** — as 8 plataformas mapeadas para eventos únicos (`purchase_approved`, `pix_generated`, `cart_abandoned`...).
6. UI nas **cores do WhatsApp** (`#075E54`, `#128C7E`, `#25D366`, balões `#DCF8C6`).
7. Integração futura com o **Let's Go App Chat** (Homenflow) como front de atendimento — Oxi Zap é o motor.
