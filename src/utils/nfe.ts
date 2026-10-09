/**
 * Lógica de leitura de XML de NF-e — Fase 4.
 *
 * Formatos aceitos:
 * - <nfeProc><NFe><infNFe ...>   (NF-e autorizada, com processo)
 * - <NFe><infNFe ...>            (sem processo)
 *
 * Campos extraídos:
 * - emit/CNPJ, emit/xNome, ide/nNF, ide/serie, ide/dhEmi,
 *   total/ICMSTot/vNF e infNFe/@Id (chave de acesso)
 * - Itens: det/prod → cProd, xProd, qCom, vUnCom, vProd
 *
 * Não depende de outros módulos internos (só fast-xml-parser),
 * o que permite testar este arquivo isoladamente com Node.
 */

import { XMLParser } from "fast-xml-parser";

/** Mensagem padrão de erro pedida na especificação da Fase 4. */
export const ERRO_NFE_INVALIDA = "XML inválido ou não é NF-e";

/** Item da tabela de produtos (det/prod). */
export interface ItemNFe {
  /** Código interno do produto (cProd). */
  cProd: string;
  /** Descrição do produto (xProd). */
  xProd: string;
  /** Quantidade bruta (qCom) como string original (ex.: "2.0000"). */
  qCom: string;
  /** Quantidade formatada em pt-BR (até 4 casas decimais). */
  qComFormatada: string;
  /** Valor unitário bruto (vUnCom) como string original. */
  vUnCom: string;
  /** Valor unitário formatado em reais (pt-BR). */
  vUnComFormatado: string;
  /** Valor total do item (vProd). */
  vProd: number;
  /** Valor total do item formatado em reais (pt-BR). */
  vProdFormatado: string;
}

/** Dados principais da NF-e usados nos cards, histórico e exports. */
export interface DadosNFe {
  /** CNPJ do emitente apenas dígitos (14). */
  cnpj: string;
  /** CNPJ formatado (00.000.000/0000-00). */
  cnpjFormatado: string;
  /** Razão social do emitente (emit/xNome). */
  razaoSocial: string;
  /** Número da nota (ide/nNF). */
  numero: string;
  /** Série da nota (ide/serie). */
  serie: string;
  /** Data de emissão dd/MM/aaaa (vazia quando ausente). */
  dataEmissao: string;
  /** Hora de emissão HH:mm (vazia quando ausente). */
  horaEmissao: string;
  /** Valor total da nota (total/ICMSTot/vNF). */
  valorTotal: number;
  /** Valor total formatado em reais (pt-BR). */
  valorTotalFormatado: string;
  /** Chave de acesso de 44 dígitos, sem o prefixo "NFe". */
  chave: string;
  /** Chave de acesso agrupada de 4 em 4 dígitos. */
  chaveFormatada: string;
  /** Itens da nota (det/prod). */
  itens: ItemNFe[];
  /** Quantidade total de itens. */
  totalItens: number;
}

export type ResultadoNFe =
  | { ok: true; dados: DadosNFe }
  | { ok: false; erro: string };

/** Parser que preserva atributos e NÃO converte valores em número (CNPJ mantém zeros à esquerda). */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

/** Percorre o documento JS devolvido pelo parser; pega o primeiro item quando houver lista. */
function caminho(alvo: unknown, ...nomes: string[]): unknown {
  let atual: unknown = alvo;
  for (const nome of nomes) {
    if (atual === null || atual === undefined || typeof atual !== "object") {
      return undefined;
    }
    if (Array.isArray(atual)) atual = atual[0];
    if (atual === null || atual === undefined) return undefined;
    atual = (atual as Record<string, unknown>)[nome];
  }
  return atual;
}

/** Converte o valor XML (string, número ou nó com #text) em texto limpo. */
function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (Array.isArray(valor)) return texto(valor[0]);
  if (typeof valor === "object") {
    const interno = (valor as Record<string, unknown>)["#text"];
    return interno === undefined ? "" : String(interno).trim();
  }
  return String(valor).trim();
}

/** Converte "1500.00" ou "1500,00" em número. */
function numero(bruto: string): number {
  const valor = Number(bruto.replace(",", "."));
  return Number.isFinite(valor) ? valor : 0;
}

/** Formata valor em reais: R$ 1.234,56 */
function formatarMoeda(valor: number): string {
  const [inteiro, centavos] = valor.toFixed(2).split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${comMilhar},${centavos}`;
}

/** Formata quantidade em pt-BR removendo zeros desnecessários: 2.0000 → "2". */
function formatarQuantidade(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/** Formata um CNPJ de 14 dígitos: 00.000.000/0000-00 */
export function formatarCNPJ(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Agrupa a chave de acesso de 44 dígitos em blocos de 4. */
export function formatarChaveAcesso(chave: string): string {
  const d = chave.replace(/\D/g, "");
  return d.replace(/(.{4})/g, "$1 ").trim();
}

/** Extrai dd/MM/aaaa e HH:mm de uma data ISO (dhEmi/dEmi); devolve vazio se não houver. */
function formatarEmissao(iso: string): { data: string; hora: string } {
  const data = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const hora = /T(\d{2}:\d{2})/.exec(iso);
  return {
    data: data ? `${data[3]}/${data[2]}/${data[1]}` : "",
    hora: hora ? hora[1] : "",
  };
}

/**
 * Analisa o XML de uma NF-e.
 * Nunca lança erro: retorna { ok: false, erro } com mensagem amigável.
 */
export function analisarNFe(xml: string): ResultadoNFe {
  if (!xml || !xml.trim()) {
    return { ok: false, erro: "O arquivo está vazio. Selecione um XML de NF-e." };
  }

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return { ok: false, erro: ERRO_NFE_INVALIDA };
  }

  const infNFe =
    caminho(doc, "nfeProc", "NFe", "infNFe") ??
    caminho(doc, "NFe", "infNFe") ??
    caminho(doc, "procNFe", "NFe", "infNFe");

  if (!infNFe || typeof infNFe !== "object") {
    return { ok: false, erro: ERRO_NFE_INVALIDA };
  }

  // Chave de acesso: atributo Id do infNFe (ex.: "NFe3526...44 dígitos").
  const chave = texto(caminho(infNFe, "@_Id")).replace(/\D/g, "");
  const numeroNota = texto(caminho(infNFe, "ide", "nNF"));

  // Sem número e sem chave, não é uma NF-e reconhecível.
  if (!numeroNota && chave.length !== 44) {
    return { ok: false, erro: ERRO_NFE_INVALIDA };
  }

  const emitente = caminho(infNFe, "emit");
  const cnpj = texto(caminho(emitente, "CNPJ")).replace(/\D/g, "");
  const razaoSocial = texto(caminho(emitente, "xNome"));
  const serie = texto(caminho(infNFe, "ide", "serie"));

  const brutoEmissao =
    texto(caminho(infNFe, "ide", "dhEmi")) ||
    texto(caminho(infNFe, "ide", "dEmi"));
  const emissao = formatarEmissao(brutoEmissao);

  const valorTotal = numero(texto(caminho(infNFe, "total", "ICMSTot", "vNF")));

  // Itens: det pode ser nó único ou lista.
  const detBruto = caminho(infNFe, "det");
  const dets = Array.isArray(detBruto)
    ? detBruto
    : detBruto
      ? [detBruto]
      : [];

  const itens: ItemNFe[] = dets.map((det) => {
    const prod = caminho(det, "prod");
    const qComBruto = texto(caminho(prod, "qCom"));
    const vUnComBruto = texto(caminho(prod, "vUnCom"));
    const vProdBruto = texto(caminho(prod, "vProd"));
    const qCom = numero(qComBruto);
    const vUnCom = numero(vUnComBruto);
    const vProd = numero(vProdBruto);
    return {
      cProd: texto(caminho(prod, "cProd")),
      xProd: texto(caminho(prod, "xProd")),
      qCom: qComBruto,
      qComFormatada: formatarQuantidade(qCom),
      vUnCom: vUnComBruto,
      vUnComFormatado: formatarMoeda(vUnCom),
      vProd,
      vProdFormatado: formatarMoeda(vProd),
    };
  });

  return {
    ok: true,
    dados: {
      cnpj,
      cnpjFormatado: cnpj ? formatarCNPJ(cnpj) : "—",
      razaoSocial: razaoSocial || "—",
      numero: numeroNota || "—",
      serie: serie || "0",
      dataEmissao: emissao.data || "—",
      horaEmissao: emissao.hora,
      valorTotal,
      valorTotalFormatado: formatarMoeda(valorTotal),
      chave,
      chaveFormatada: chave ? formatarChaveAcesso(chave) : "—",
      itens,
      totalItens: itens.length,
    },
  };
}

/** Escapa um campo para CSV (separador ";", UTF-8, CRLF). */
function campoCSV(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

/**
 * Gera o CSV da NF-e: bloco de dados da nota + bloco de itens.
 * Usa ";" como separador (padrão Excel pt-BR) e vírgula como decimal.
 */
export function gerarCSVNFe(dados: DadosNFe): string {
  const linhas: string[] = [
    "Campo;Valor",
    `Número da NF-e;${campoCSV(dados.numero)}`,
    `Série;${campoCSV(dados.serie)}`,
    `Data de emissão;${campoCSV(dados.dataEmissao)}`,
    `CNPJ emitente;${campoCSV(dados.cnpjFormatado)}`,
    `Razão social emitente;${campoCSV(dados.razaoSocial)}`,
    `Valor total;${dados.valorTotal.toFixed(2).replace(".", ",")}`,
    `Chave de acesso;${dados.chave}`,
    `Exportado em;${new Date().toLocaleString("pt-BR")}`,
    "",
    "Código;Produto;Quantidade;V. Unitário;V. Total",
    ...dados.itens.map((item) =>
      [
        campoCSV(item.cProd),
        campoCSV(item.xProd),
        item.qCom.replace(".", ","),
        item.vUnCom.replace(".", ","),
        item.vProd.toFixed(2).replace(".", ","),
      ].join(";")
    ),
    "",
    `Total de itens;${dados.totalItens}`,
  ];
  return linhas.join("\r\n");
}