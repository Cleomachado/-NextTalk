"use client";
// Guia "Como pegar o token permanente" do Meta Ads — o mesmo passo a passo que o dono seguiu em
// 13/10/2026 (usuário do sistema como Funcionário, porque o limite de Admin trava a criação).
// Usado em 3 lugares: Integrações → Meta Ads, nó "Métricas Meta Ads" e Dashboard de Lançamento.
export default function GuiaTokenMetaAds({ onde = "integracoes", aberto = false }: { onde?: "integracoes" | "no" | "dashboard"; aberto?: boolean }) {
  const ondeColar =
    onde === "no"
      ? <>Cole o ID e o token em <a href="/integracoes" target="_blank" rel="noreferrer"><b>Integrações → Meta Ads</b></a> (recomendado: fica cifrado e vale pra todos os fluxos) ou nos campos deste nó (fica visível no desenho do fluxo).</>
      : onde === "dashboard"
      ? <>Cole o ID e o token em <a href="/integracoes"><b>Integrações → Meta Ads</b></a>, clique <b>Salvar</b> e depois <b>Testar</b>. Volte aqui e clique <b>Sincronizar agora</b>.</>
      : <>Cole o ID no primeiro campo e o token no segundo, clique <b>Salvar</b> e depois <b>Testar</b>. Deu certo quando aparece o gasto de hoje e o fuso da conta.</>;
  return (
    <details className="guia-meta" open={aberto} style={{ fontSize: 12.5, lineHeight: 1.55, border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", background: "transparent" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Como pegar o token permanente (passo a passo)</summary>
      <ol style={{ margin: "8px 0 4px", paddingLeft: 18, display: "grid", gap: 6 }}>
        <li>
          Abra <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer"><b>Configurações do negócio → Usuários → Usuários do sistema</b></a> e clique <b>Adicionar</b>.
          Nome sugerido: <i>ZapConverte Métricas</i>. Função: <b>Funcionário</b>. Se escolher Admin e der erro de limite, é por isso: Funcionário basta.
        </li>
        <li>
          No usuário criado, clique <b>Atribuir ativos</b>. Em <b>Contas de anúncios</b>, marque a sua conta e ligue só <b>Ver desempenho</b>.
          Em <b>Apps</b>, marque o app que vai gerar o token (ex.: <i>Métricas Ads</i>). Salve.
        </li>
        <li>
          Ainda no usuário, clique <b>Gerar novo token</b>. Escolha o app, em <b>Expiração</b> marque <b>Nunca</b> e nas permissões marque
          <b> ads_read</b> e <b>read_insights</b>. Clique <b>Gerar token</b> e copie na hora: a Meta mostra uma vez só.
        </li>
        <li>
          Pegue o <b>ID da conta de anúncio</b>: no <a href="https://adsmanager.facebook.com/" target="_blank" rel="noreferrer">Gerenciador de Anúncios</a>, é o número depois de <code>act=</code> na barra de endereço
          (também aparece no seletor de contas). Pode colar só o número, com <code>act_</code> ou a URL inteira.
        </li>
        <li>{ondeColar}</li>
      </ol>
      <div style={{ marginTop: 6 }}>
        <b>Se o Testar der erro:</b>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "grid", gap: 3 }}>
          <li><i>"não enxerga essa conta de anúncio"</i>: falta o passo 2 (atribuir a conta ao usuário do sistema) ou o ID está errado.</li>
          <li><i>"não tem a permissão ads_read"</i>: gere o token de novo marcando ads_read e read_insights.</li>
          <li><i>"recusou o token"</i>: o token foi revogado ou colado pela metade. Gere outro e cole de novo.</li>
        </ul>
      </div>
      <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>
        Não mande o token por WhatsApp nem por e-mail: quem tem o token lê os números da sua conta de anúncio. Ele só lê, não mexe em campanha nem em pagamento.
      </div>
    </details>
  );
}
