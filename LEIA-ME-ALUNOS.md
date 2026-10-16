# White Label — material de aula

Código-fonte do sistema de automação de WhatsApp entregue aos alunos do White Label. **Proibida a revenda do código.**

- `app/api` — motor (Fastify + TypeScript): webhooks da Meta, UazAPI e Kiwify, fluxos e IA.
- `app/web` — painel (Next.js).
- `app/site` — site (HTML estático + nginx). Troque pelo seu.
- `deploy/` — deploy em Docker Swarm + Traefik (veja `deploy/DEPLOY.md` e `deploy/.env.example`).
- `docs/GUIA-MONTAR-SISTEMA-WHATSAPP.md` — por onde começar.

Nenhuma senha, token ou chave vem neste repositório. Cada aluno cria o próprio `deploy/.env` a partir do `.env.example`.

## Atualizações

- `VERSAO-WHITELABEL` — a data da versão deste repositório.
- `ATUALIZACOES.md` — a lista de atualizações, da mais nova para a mais antiga.
- `atualizacoes/AAAA-MM-DD.md` — o que mudou em cada uma, arquivo por arquivo.
- `COMO-ATUALIZAR.md` — o passo a passo para o seu Claude aplicar só o que falta, sem apagar o que você personalizou.
