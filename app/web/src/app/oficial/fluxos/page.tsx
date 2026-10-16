import { FlowList } from "@/components/FlowList";

// Os fluxos são dos DOIS canais: o motor roda a MESMA automação no Lite e na API Oficial (o
// gateway muda, o fluxo não). Esta rota existe pra lista aparecer também quando a conta ativa é
// API (o item "Fluxos" do grupo Lite some da sidebar nesse modo — foi o que escondeu a Ana do
// Admin em 16/08). Era um placeholder "em construção"; agora é o builder de verdade.
export default function Page() {
  return <FlowList />;
}
