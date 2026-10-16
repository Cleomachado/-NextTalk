# Como atualizar o seu sistema (instruções para o Claude do aluno)

Este repositório é a FONTE das atualizações. O projeto do aluno é OUTRO repositório, com as personalizações dele (nome, logo, cores, domínios, textos, site). A regra principal: **atualizar sem sobrescrever o que o aluno mudou**.

## 1. Descobrir a versão instalada

1. No projeto do aluno, leia o arquivo `VERSAO-WHITELABEL` na raiz.
2. Se ele não existir, o aluno está na versão inicial: considere `2026-10-14`.
3. Leia `ATUALIZACOES.md` deste repositório. As atualizações a aplicar são as de data MAIOR que a instalada, da mais antiga para a mais nova.
4. Se a versão instalada já for a mais nova, avise o aluno e pare.

## 2. Preparar sem risco

1. No repositório do aluno, confira que não há mudança pendente (`git status`). Se houver, peça para ele salvar (commit) antes.
2. Crie uma branch nova: `git checkout -b atualizacao-AAAA-MM-DD` (a data da atualização mais nova).
3. **Nunca** use `git push --force`, `git reset --hard` nem apague o repositório do aluno. Nunca copie a pasta inteira por cima.

## 3. Aplicar cada atualização, em ordem

Para cada `atualizacoes/AAAA-MM-DD.md` que falta:

1. Leia a nota inteira: arquivos novos, alterados e removidos, mudanças de banco e variáveis de ambiente.
2. **Arquivo novo:** copie como está.
3. **Arquivo alterado:** compare o arquivo deste repositório com o do aluno.
   - Se o aluno nunca mexeu nele, pode substituir.
   - Se o aluno personalizou (nome da marca, cores, textos, domínio), aplique só as linhas que a atualização mudou e mantenha as personalizações dele. Na dúvida, mostre a diferença e pergunte.
   - Atalho: se o projeto do aluno tem este repositório como remoto, `git diff wl-ANTERIOR wl-NOVA -- <arquivo>` mostra exatamente o que mudou. Dá pra aplicar com `git apply -3`.
4. **Arquivo removido:** só remova se o aluno não usa mais.
5. **Nunca copie por cima:** `deploy/.env`, `app/site/` (o site é do aluno), logos e ícones, e qualquer fluxo ou configuração que o aluno criou no painel (isso mora no banco, não no código).

## 4. Conferir e publicar

1. `cd app/api && npx tsc --noEmit -p .`
2. `cd app/web && npx tsc --noEmit -p . && npm run build`
3. Se tudo passar, faça o commit na branch e mostre o resumo ao aluno. Com o OK dele, faça o merge na `main` e o deploy (`bash deploy/deploy.sh`).
4. Atualize o `VERSAO-WHITELABEL` do aluno para a data aplicada.
5. Banco de dados: as tabelas e colunas novas são criadas sozinhas quando o motor sobe (arquivo `app/api/src/db.ts`). Não precisa rodar SQL na mão.
