// Leitor de LISTA DE CONTATOS pra importação (Contatos e Disparador): .csv, .txt ou Excel
// (.xlsx/.xls). Tudo no navegador — o motor só recebe a lista já limpa.
//
// Colunas: a 1ª com cara de telefone vira o número; "nome" vem da coluna chamada nome/name
// (ou da 2ª coluna); as demais viram variáveis (variavel1…) pro disparo. Aceita cabeçalho
// ou não. Número brasileiro SEM o 55 ganha o 55 — mas só quando TEM CARA de brasileiro: a regra
// antiga punha 55 em tudo que tinha 10-11 dígitos, e celular dos EUA/Canadá (1 + 10) e da Espanha
// (34 + 9) também têm 11 — viravam um número brasileiro de OUTRA pessoa. Caso real 25/09: numa
// lista de 300, seis estrangeiros iam para desconhecidos no Brasil (o que ainda derruba a
// qualidade do número na Meta). Ver `ehBrasileiro` abaixo.

export interface ContatoImportado { numero: string; nome?: string; params?: string[] }
// O que o leitor achou, pra mostrar ao usuário antes de importar.
export interface ResumoImportacao {
  linhas: number;         // linhas com conteúdo (sem o cabeçalho)
  validos: number;        // contatos únicos que entram
  semDdi: number;         // vieram só com DDD + número brasileiro → ganharam o 55
  internacionais: number; // reconhecidos como de fora do Brasil → enviados como estão
  duplicados: number;     // mesmo número repetido (em qualquer formato: +55, 55, sem 55, com hífen…)
  invalidos: number;      // não deu pra ler um telefone
  comNome: number;
}
export interface LeituraContatos { contatos: ContatoImportado[]; resumo: ResumoImportacao }

const CAB_TELEFONE = /^(telefone|tel|celular|whatsapp|numero|número|fone|phone|mobile|contato)$/i;
// Casamento EXATO era estreito demais pra planilha de cliente: "Nome Completo", "Nome do Aluno",
// "primeiro nome" e afins não batiam, o nome vinha vazio e o {{nome}} do template saía em branco —
// o que faz a Meta recusar a mensagem inteira ("Parameter of type text is missing text value").
// Agora: qualquer cabeçalho que COMECE com nome/name (e os sinônimos de sempre).
const CAB_NOME = /^(nome|name|cliente|lead|contato_nome|aluno|assinante|paciente)\b|^(nome|name)[ _-]/i;

// DDDs que existem no Brasil. Um "DDD" inventado (20, 23, 30…) é sinal de que o número é de fora.
const DDD_BR = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,
  51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);

// Tem cara de número brasileiro SEM o código do país?
//   celular: DDD + 9 dígitos começando em 9   (11 dígitos)
//   fixo:    DDD + 8 dígitos começando em 2-5 (10 dígitos)
// É essa segunda condição que separa o celular de São Paulo (11 9xxxx-xxxx) de um número dos
// EUA (1 781 732-5027), que tem o mesmo tamanho e também "começa com 1".
function ehBrasileiroSemDdi(d: string): boolean {
  const ddd = Number(d.slice(0, 2));
  if (!DDD_BR.has(ddd)) return false;
  if (d.length === 11) return d[2] === "9";
  if (d.length === 10) return /[2-5]/.test(d[2]);
  return false;
}

// Tira +, espaço, hífen, parênteses, ponto… e devolve o número pronto pra enviar.
// `semDdi` = o 55 foi acrescentado por nós. `internacional` = veio de fora e vai como está.
export function normalizaTelefoneDetalhado(bruto: string): { numero: string; semDdi: boolean; internacional: boolean } {
  const d = String(bruto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return { numero: "", semDdi: false, internacional: false };
  // Já é brasileiro com o 55 na frente (12 = fixo/antigo, 13 = celular)
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return { numero: d, semDdi: false, internacional: false };
  if (ehBrasileiroSemDdi(d)) return { numero: "55" + d, semDdi: true, internacional: false };
  // Resto: trata como já tendo o código do país e NÃO inventa 55 (é o que salvava o estrangeiro).
  if (d.length >= 10 && d.length <= 15) return { numero: d, semDdi: false, internacional: true };
  return { numero: "", semDdi: false, internacional: false };
}
export const normalizaTelefone = (bruto: string): string => normalizaTelefoneDetalhado(bruto).numero;

// Linhas já separadas em células → contatos + resumo. Detecta cabeçalho pela 1ª linha.
export function linhasParaContatosDetalhado(linhas: string[][]): LeituraContatos {
  const out: ContatoImportado[] = [];
  const resumo: ResumoImportacao = { linhas: 0, validos: 0, semDdi: 0, internacionais: 0, duplicados: 0, invalidos: 0, comNome: 0 };
  const limpas = linhas.map((l) => l.map((c) => String(c ?? "").trim().replace(/^"|"$/g, "")));
  if (!limpas.length) return { contatos: out, resumo };
  let iTel = -1, iNome = -1, inicio = 0;
  const cab = limpas[0];
  const temCabecalho = cab.some((c) => CAB_TELEFONE.test(c)) || cab.some((c) => CAB_NOME.test(c));
  if (temCabecalho) {
    iTel = cab.findIndex((c) => CAB_TELEFONE.test(c));
    iNome = cab.findIndex((c) => CAB_NOME.test(c));
    inicio = 1;
  }
  const vistos = new Set<string>();
  for (let r = inicio; r < limpas.length; r++) {
    const cels = limpas[r];
    if (!cels.some((c) => c)) continue;
    resumo.linhas++;
    let colTel = iTel;
    let lido = { numero: "", semDdi: false, internacional: false };
    if (colTel >= 0) lido = normalizaTelefoneDetalhado(cels[colTel] ?? "");
    else {
      // sem cabeçalho: a primeira célula com telefone válido é o número
      colTel = cels.findIndex((c) => normalizaTelefone(c));
      if (colTel >= 0) lido = normalizaTelefoneDetalhado(cels[colTel]);
    }
    if (!lido.numero) { resumo.invalidos++; continue; }
    if (vistos.has(lido.numero)) { resumo.duplicados++; continue; }
    vistos.add(lido.numero);
    if (lido.semDdi) resumo.semDdi++;
    if (lido.internacional) resumo.internacionais++;
    const resto = cels.filter((_, i) => i !== colTel);
    let nome: string | undefined;
    if (iNome >= 0) nome = cels[iNome] || undefined;
    else nome = resto[0] && !/^\d+$/.test(resto[0]) ? resto[0] : undefined;
    const params = iNome >= 0 ? cels.filter((_, i) => i !== colTel && i !== iNome) : resto.slice(1);
    if (nome) resumo.comNome++;
    out.push({ numero: lido.numero, nome, params: params.length ? params : undefined });
  }
  resumo.validos = out.length;
  return { contatos: out, resumo };
}
export const linhasParaContatos = (linhas: string[][]): ContatoImportado[] => linhasParaContatosDetalhado(linhas).contatos;

export function textoParaContatosDetalhado(texto: string): LeituraContatos {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(/[,;\t]/));
  return linhasParaContatosDetalhado(linhas);
}
export const textoParaContatos = (texto: string): ContatoImportado[] => textoParaContatosDetalhado(texto).contatos;

// Lê o arquivo escolhido (csv/txt direto; Excel pela SheetJS carregada só quando precisa).
export async function lerArquivoContatosDetalhado(f: File): Promise<LeituraContatos> {
  const nome = f.name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|ods)$/.test(nome)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" }) as string[][];
    return linhasParaContatosDetalhado(linhas);
  }
  return textoParaContatosDetalhado(await f.text());
}
export const lerArquivoContatos = async (f: File): Promise<ContatoImportado[]> => (await lerArquivoContatosDetalhado(f)).contatos;

// Frase do aviso pro usuário: "3 sem DDI (colocamos o 55) · 2 repetidos ignorados · 1 inválido".
export function fraseResumo(r: ResumoImportacao): { texto: string; alerta: boolean } {
  const partes: string[] = [];
  if (r.semDdi) partes.push(`${r.semDdi} sem DDI (colocamos o 55)`);
  if (r.internacionais) partes.push(`${r.internacionais} de fora do Brasil (enviados como estão, sem 55)`);
  if (r.duplicados) partes.push(`${r.duplicados} repetido${r.duplicados === 1 ? "" : "s"} ignorado${r.duplicados === 1 ? "" : "s"}`);
  if (r.invalidos) partes.push(`${r.invalidos} sem telefone legível`);
  return { texto: partes.join(" · "), alerta: partes.length > 0 };
}
