---
description: Auditoria de segurança do app — varre por área, PROVA cada achado no código antes de reportar, entrega SECURITY_AUDIT.md e SECURITY_CHECKLIST.md
---

Você vai auditar a segurança deste aplicativo inteiro. Este comando nasceu de uma auditoria real
que encontrou três falhas P0 em produção num SaaS multi-tenant. As armadilhas descritas aqui
aconteceram de verdade — trate cada uma como um caso a procurar, não como teoria.

Escopo pedido: $ARGUMENTS
(Se vier vazio, audite o app inteiro.)

# Regras inegociáveis

1. **Nada de achado sem prova.** Para cada suspeita, abra o arquivo, leia o caminho completo do
   dado e mostre a linha exata. Suspeita não confirmada vai para uma seção separada de
   "verificar", nunca para a lista de achados.
2. **Calibre toda sonda antes de concluir.** Se testar um endereço ao vivo, teste primeiro um
   endereço que você sabe que não existe. Já concluí "a rota existe" porque veio 401, quando na
   verdade todo caminho administrativo devolve 401 sem autenticação, exista ele ou não. Um teste
   que não distingue os dois casos não é evidência.
3. **Não corrija durante a varredura.** Primeiro o mapa completo, depois as correções por
   severidade. Corrigir no meio esconde o padrão que se repete em outros dez lugares.
4. **Nunca teste destrutivo em produção.** Nada de apagar, desativar conta, estourar limite ou
   forçar login de terceiro em ambiente real. Leitura e código; o resto em ambiente local.
5. **Crie um ponto de retorno** antes da primeira correção: uma tag git nomeada com a data.
6. **Não imprima segredo nenhum** no relatório nem no chat. Cite o arquivo e a linha, e os quatro
   últimos caracteres se for indispensável identificar qual credencial é.

# Fase 0 — mapa antes da varredura

Antes de procurar falha, descreva em poucas linhas, com base no código e não em suposição:

- Qual é a fronteira de confiança: o que é público, o que exige login, o que exige papel elevado.
- Quem são os atores: visitante, usuário comum, dono de conta, membro convidado, administrador da
  plataforma, sistema externo que chama webhook.
- Onde mora o estado sensível: banco, arquivos de configuração, cache, variáveis de ambiente.
- Se o app é multi-inquilino, qual é o mecanismo que separa um cliente do outro, e onde ele é
  aplicado. Nomeie a função.

Liste todos os pontos de entrada: rotas HTTP, webhooks, filas, tarefas agendadas, comandos.
Uma tabela com rota, método, quem pode chamar e o que ela alcança.

# Fase 1 — as áreas

Percorra todas. Para cada uma, diga o que verificou, mesmo quando não achou nada.

## 1. Segredos e credenciais
Procure chave, token e senha escritos no código, em arquivo versionado, em log, em mensagem de
erro e no histórico do git. Confira o que é versionado de fato, não o que deveria ser: leia o
`.gitignore` e depois rode `git ls-files` para ver o que já entrou. Confira arquivos de sobra,
como cópias de segurança de configuração com data no nome. Confira se o arquivo de orquestração
publicado no repositório traz valor literal em vez de referência a variável.
Se achar segredo exposto, o conserto tem duas partes e a segunda é a que importa: tirar do código
e **rotacionar a credencial**, porque o valor antigo continua válido.

## 2. Autenticação
Cadastro, login, sessão, recuperação de senha, segundo fator, confirmação de e-mail, convite.
Perguntas a responder com código na mão: o token de sessão é guardado com hash ou em claro? Expira?
É invalidado ao trocar a senha? Existe caminho que confirma a conta sozinho e pula o segundo fator?
Existe rota que devolve mensagem diferente para e-mail existente e inexistente, ou que responde em
tempo diferente, entregando a lista de clientes a quem sondar? Existe sinalizador de "precisa
trocar a senha" que é calculado e nunca aplicado?

## 3. Autorização, IDOR e escalada
Para cada rota que recebe identificador, confirme que o dono é verificado no servidor, não na tela.
Troque mentalmente o identificador pelo de outro usuário e siga o código até o banco.
Confira se papel restrito é barrado no servidor e não apenas escondido no menu. Um item some da
navegação mas a rota continua respondendo é achado, não detalhe.

## 4. Separação entre clientes
Esta é a área que mais rendeu falha real, então gaste tempo aqui.
- Toda consulta ao banco filtra pelo identificador do inquilino? Procure a que esqueceu.
- Existe caminho em que, faltando contexto, o código **cai no inquilino padrão** em vez de recusar?
  Esse é o padrão mais perigoso, porque o padrão costuma ser a conta do dono da plataforma.
- **Procure o vazamento no sentido inverso também.** No caso real, ninguém via os dados do dono; era
  o dono que estava recebendo os dados de uma cliente, porque o pareamento caiu na conta errada.
  Auditar só o sentido óbvio deixa metade do problema de pé.
- Quando o app envia algo em nome do cliente, confirme que sai pelo canal **dele**. Mandar pelo
  canal errado é pior que não mandar.
- Identificador criado pelo usuário colide entre inquilinos? Se a rota resolve só pelo
  identificador, dois clientes com o mesmo nome se cruzam.

## 5. Entrada do usuário
Consulta ao banco montada por concatenação. Caminho de arquivo vindo do usuário. Expressão regular
escrita pelo usuário, que trava o processo inteiro com retrocesso catastrófico. Endereço fornecido
pelo usuário que o servidor visita, inclusive **depois de redirecionamento**, que é onde a defesa
ingênua falha: revalide cada salto, não só o primeiro. Texto que vai para planilha e é interpretado
como fórmula. Conteúdo que volta para a tela sem escape. Normalização de caminho antes da checagem,
porque codificação percentual passa por comparação de texto cru.

## 6. Webhooks e integrações
A assinatura é conferida? Com comparação de tempo constante? Existe proteção contra reenvio da
mesma mensagem, e ela é baseada num identificador do remetente, não no relógio local? Um reenvio
consegue renovar acesso, somar prazo ou duplicar concessão? O corpo tem limite de tamanho?

## 7. Dinheiro e concessão de acesso
Refaça o caminho da compra até a liberação. A falha real aqui foi silenciosa: o sistema liberava o
plano completo para quem comprou um produto barato, porque a consulta aceitava qualquer venda paga
associada ao e-mail. Verifique que **qual produto** foi comprado decide **qual acesso** é liberado.
Verifique período de teste: dá para renovar sozinho, empilhar, ou reativar conta cancelada por uma
rota pública? Estorno desfaz o acesso?

## 8. Custo e abuso
Toda chamada que gasta dinheiro do dono do app, como modelo de linguagem, envio, armazenamento e
processamento pesado, precisa de teto por usuário e por período. Sem isso, um cliente consome a
fatura de todos. Liste cada uma e diga qual tem teto e qual não tem.

## 9. Upload e arquivos estáticos
Tipo e tamanho conferidos no servidor. Nome de arquivo sanitizado. Arquivo do usuário servido de
origem separada ou com cabeçalho que impede execução. E confira o que a imagem publica: uma pasta
copiada inteira para o servidor web transforma qualquer rascunho esquecido ali em download público.

## 10. Cabeçalhos, cookies e navegador
Cabeçalhos de transporte, de tipo, de moldura, de referência e de permissões. Cookie de sessão com
as marcas de segurança e de mesma origem. Política de conteúdo: suba primeiro em modo de relato,
observe o que quebraria, só então aplique.

## 11. Registros e dados pessoais
Procure dado pessoal completo saindo em registro de execução: telefone, e-mail, documento, endereço,
conteúdo de conversa. Registro é lido por gente e vai para serviço de terceiro. Mascare.

## 12. Dependências, build e implantação
Vulnerabilidade conhecida nas dependências, e diga se é explorável **neste** uso ou não, para não
inflar o relatório. Confira o que a imagem final realmente contém e o que ela realmente serve.
Confira se variável de ambiente nova precisa ser declarada em mais de um lugar, porque esquecer um
faz a proteção não ligar em silêncio.

## 13. Acesso à máquina
Autenticação por chave ou por senha. Chave sem frase secreta funciona sozinha para quem copiar o
arquivo. Login direto de administrador aberto para a internet. Porta exposta sem necessidade.

# Fase 2 — como provar

Use o método mais barato que produza certeza, nesta ordem:

1. **Ler o código** seguindo o dado da entrada até o destino. É a prova mais forte e quase sempre
   basta.
2. **Extrair a função e rodar com dublês**, quando a lógica tem muitos ramos. Foi assim que os sete
   cenários de resolução de canal foram confirmados, sem subir nada.
3. **Consultar o banco em leitura**, quando a pergunta é "isso já aconteceu com algum cliente?".
4. **Sondar o ambiente ao vivo** por último, sempre com a calibragem da regra 2.

Quando comparar o que está publicado com o que está no código, não confie em suposição: compare o
horário do último envio com o horário de modificação dos arquivos. Foi assim que se descobriu que
metade de uma entrega tinha ficado de fora.

# Fase 3 — entrega

Grave dois arquivos.

**`SECURITY_AUDIT.md`**, com uma tabela no topo e uma seção por achado, ordenada por severidade.
Cada achado leva: identificador curto, severidade, arquivo e linha, quem consegue explorar e a
partir de onde, o que consegue, o conserto proposto e a situação, que é uma entre corrigido,
pendente e requer ação manual do dono. Severidade assim:

| nível | critério |
|---|---|
| P0 | qualquer pessoa da internet obtém dado de terceiro, acesso pago ou controle da conta |
| P1 | usuário autenticado alcança dado ou recurso de outro inquilino, ou derruba o serviço |
| P2 | exige condição incomum, ou o dano é limitado |
| P3 | endurecimento, sem exploração conhecida |

Separe no fim: achados não confirmados, com o que falta para confirmar, e ações que só o dono pode
executar, como rotacionar credencial.

**`SECURITY_CHECKLIST.md`**, curto, com o que conferir antes de cada entrega nova, escrito como
pergunta objetiva. Ele é o que impede a mesma falha de voltar.

# Fase 4 — correção

Só depois do relatório aprovado. Por severidade, começando pelas P0. Uma correção por vez, com o
raciocínio do porquê aquilo fecha o buraco. Ao final de cada uma, diga como verificar que fechou.

Escreva um teste automatizado para cada falha de lógica corrigida, usando o executor de testes que
o projeto já tem, sem acrescentar dependência nova. Falha de configuração não precisa de teste;
falha de regra precisa, senão volta.

# Princípios que devem guiar toda correção

- **Falhe fechado.** Faltando contexto, recuse em vez de assumir um padrão. Todo caso real grave
  aqui veio de um padrão silencioso que apontava para a conta errada.
- **A verificação mora no servidor.** Esconder na tela não é controle de acesso.
- **Uma fonte de verdade por decisão.** Quando dois caminhos decidem a mesma coisa, um vai ficar
  para trás.
- **O conserto de segredo exposto inclui rotacionar**, sempre.
- **Silêncio é o pior sintoma.** Proteção que não liga por falta de configuração precisa gritar no
  arranque, não falhar calada.
