/**
 * Lógica de leitura da linha digitável de boletos — Fase 2.
 *
 * Estrutura da linha digitável (47 dígitos, sem pontos/espaços):
 * - Campo 1  (10): banco (3) + moeda (1) + campo livre (5) + DV (1)
 * - Campo 2  (11): campo livre (10) + DV (1)
 * - Campo 3  (11): campo livre (10) + DV (1)
 * - Campo 4   (1): DV geral do código de barras
 * - Campo 5  (14): fator de vencimento (4, posições 34–37) + valor (10)
 *
 * O código de barras do boleto tem 44 dígitos:
 * banco (3) + moeda (1) + DV geral (1) + fator (4) + valor (10) + campo livre (25).
 */

/** Bancos reconhecidos: código de 3 dígitos → nome. */
export const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "104": "Caixa",
  "237": "Bradesco",
  "341": "Itaú",
  "260": "Nubank",
  "077": "Inter",
};

export interface BancoInfo {
  codigo: string;
  nome: string;
}

export interface DadosBoleto {
  /** Linha digitável apenas com dígitos (47 caracteres). */
  linha: string;
  /** Linha digitável com máscara (00000.00000 00000.000000 ...). */
  linhaFormatada: string;
  banco: BancoInfo;
  /** Valor em reais (dígitos ÷ 100). */
  valor: number;
  /** Valor formatado em pt-BR (ex.: "R$ 123,45"). */
  valorFormatado: string;
  /** Fator de vencimento (4 dígitos, posições 34–37 da linha sem pontos). */
  fatorVencimento: number;
  /** Data de vencimento; null quando o fator é 0000 (sem vencimento). */
  dataVencimento: Date | null;
  /** Data formatada (dd/MM/aaaa) ou "Sem vencimento". */
  dataVencimentoFormatada: string;
  /** Código de barras de 44 dígitos. */
  codigoBarras: string;
  /** Código de barras agrupado em blocos: banco moeda fator valor campo livre. */
  codigoBarrasFormatado: string;
}

export type ResultadoAnalise =
  | { ok: true; dados: DadosBoleto }
  | { ok: false; erro: string };

/** Data-base do fator de vencimento: fator 0 = 07/10/1997 (UTC, sem fuso). */
const DATA_BASE_VENCIMENTO = Date.UTC(1997, 9, 7);
const MS_POR_DIA = 24 * 60 * 60 * 1000;
/** FEBRABAN: em 22/02/2025 o fator reiniciou (9999 = 21/02/2025 → 1000 = 22/02/2025). */
const INICIO_CICLO_2 = Date.UTC(2025, 1, 22);
const DIAS_ENTRE_CICLOS = 9000;

/** Remove pontos, espaços (inclusive quebras de linha) e hífens da entrada. */
export function limparLinha(entrada: string): string {
  return entrada.replace(/[\s.\-]/g, "");
}

/**
 * Valida a linha já limpa. Retorna mensagem de erro amigável ou null se válida.
 */
export function validarLinha(linha: string): string | null {
  if (linha.length === 0) {
    return "Cole a linha digitável do boleto para começar a análise.";
  }
  if (!/^\d+$/.test(linha)) {
    return "A linha contém caracteres inválidos. Use apenas números, pontos e espaços.";
  }
  if (linha.length !== 47) {
    return `A linha digitável deve ter 47 dígitos — foram encontrados ${linha.length}. Verifique se copiou a linha completa.`;
  }
  return null;
}

/**
 * Módulo 10 (FEBRABAN): pesos 2 e 1 alternados da direita para a esquerda;
 * produtos maiores que 9 têm os dígitos somados; DV = (10 - soma % 10) % 10.
 */
export function calcularDVModulo10(dados: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = dados.length - 1; i >= 0; i--) {
    const produto = Number(dados[i]) * peso;
    soma += produto > 9 ? produto - 9 : produto;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/**
 * Módulo 11 (FEBRABAN): pesos 2 a 9 da direita para a esquerda;
 * DV = 11 - (soma % 11); se o DV resultar em 10 ou 11, o DV é 0.
 */
export function calcularDVModulo11(corpo: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = corpo.length - 1; i >= 0; i--) {
    soma += Number(corpo[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 10 || dv === 11 ? 0 : dv;
}

/** Valida o DV (módulo 10) do campo 1, 2 ou 3 da linha de 47 dígitos. */
export function validarDVModulo10(campo: 1 | 2 | 3, linha: string): boolean {
  const inicio = campo === 1 ? 0 : campo === 2 ? 10 : 21;
  const posicaoDV = campo === 1 ? 9 : campo === 2 ? 20 : 31;
  return (
    calcularDVModulo10(linha.slice(inicio, posicaoDV)) ===
    Number(linha[posicaoDV])
  );
}

/**
 * Valida o DV geral (módulo 11) — posição 32 da linha limpa — contra os
 * outros 43 dígitos do código de barras (44 dígitos sem o DV geral).
 */
export function validarDVModulo11(linha: string): boolean {
  const corpo =
    linha.slice(0, 4) + // banco (3) + moeda (1)
    linha.slice(33, 47) + // fator (4) + valor (10)
    linha.slice(4, 9) + // campo livre (5)
    linha.slice(10, 20) + // campo livre (10)
    linha.slice(21, 31); // campo livre (10)
  return calcularDVModulo11(corpo) === Number(linha[32]);
}

/** Extrai o banco pelos 3 primeiros dígitos da linha. */
export function extrairBanco(linha: string): BancoInfo {
  const codigo = linha.slice(0, 3);
  return { codigo, nome: BANCOS[codigo] ?? "Banco não identificado" };
}

/** Extrai o valor: últimos 10 dígitos divididos por 100. */
export function extrairValor(linha: string): number {
  return Number(linha.slice(-10)) / 100;
}

/** Extrai o fator de vencimento: posições 34–37 da linha sem pontos. */
export function extrairFatorVencimento(linha: string): number {
  return Number(linha.slice(33, 37));
}

/**
 * Calcula a data de vencimento somando o fator de dias à base 07/10/1997.
 * Fator 0000 significa boleto sem vencimento e retorna null.
 *
 * Ciclo 2 FEBRABAN: o fator reiniciou em 22/02/2025 (9999 = 21/02/2025).
 * Se o fator está entre 1000 e 4999, a data do 1º ciclo cai antes de
 * 22/02/2025 e hoje já estamos no 2º ciclo — soma-se 9000 dias ao fator,
 * assim fator 1000 = 22/02/2025, 1001 = 23/02/2025 etc.
 */
export function calcularDataVencimento(
  fator: number,
  hoje: Date = new Date()
): Date | null {
  if (!fator) return null;

  const dataCiclo1 = DATA_BASE_VENCIMENTO + fator * MS_POR_DIA;
  const noSegundoCiclo =
    fator >= 1000 &&
    fator <= 4999 &&
    dataCiclo1 < INICIO_CICLO_2 &&
    hoje.getTime() >= INICIO_CICLO_2;

  const fatorAjustado = noSegundoCiclo ? fator + DIAS_ENTRE_CICLOS : fator;
  return new Date(DATA_BASE_VENCIMENTO + fatorAjustado * MS_POR_DIA);
}

/** Reconstrói o código de barras de 44 dígitos a partir da linha de 47. */
export function montarCodigoBarras(linha: string): string {
  return (
    linha.slice(0, 4) + // banco (3) + moeda (1)
    linha.slice(32, 33) + // DV geral (campo 4)
    linha.slice(33, 47) + // fator (4) + valor (10)
    linha.slice(4, 9) + // campo livre (5)
    linha.slice(10, 20) + // campo livre (10)
    linha.slice(21, 31) // campo livre (10)
  );
}

/** Aplica a máscara 00000.00000 00000.000000 00000.000000 0 00000000000000. */
export function formatarLinha(linha: string): string {
  return [
    `${linha.slice(0, 5)}.${linha.slice(5, 10)}`,
    `${linha.slice(10, 15)}.${linha.slice(15, 21)}`,
    `${linha.slice(21, 26)}.${linha.slice(26, 32)}`,
    linha.slice(32, 33),
    linha.slice(33, 47),
  ].join(" ");
}

/** Agrupa o código de barras de 44 dígitos em blocos legíveis. */
export function formatarCodigoBarras(codigo: string): string {
  return [
    codigo.slice(0, 5), // banco + moeda + DV geral
    codigo.slice(5, 9), // fator
    codigo.slice(9, 19), // valor
    codigo.slice(19, 24), // campo livre (5)
    codigo.slice(24, 34), // campo livre (10)
    codigo.slice(34, 44), // campo livre (10)
  ].join(" ");
}

/** Formata uma data como dd/MM/aaaa (ou "Sem vencimento" quando null). */
export function formatarData(data: Date | null): string {
  if (!data) return "Sem vencimento";
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}

/** Formata um valor em reais no padrão pt-BR: R$ 1.234,56 */
export function formatarMoeda(valor: number): string {
  const [inteiro, centavos] = valor.toFixed(2).split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${comMilhar},${centavos}`;
}

/**
 * Analisa uma linha digitável colada pelo usuário.
 * Nunca lança erro: retorna { ok: false, erro } com mensagem amigável.
 */
export function analisarBoleto(entrada: string): ResultadoAnalise {
  const linha = limparLinha(entrada);
  const erro = validarLinha(linha);
  if (erro) return { ok: false, erro };

  // DVs reais FEBRABAN: módulo 10 nos campos 1–3 e módulo 11 no campo 4 (DV geral).
  const campos: Array<1 | 2 | 3> = [1, 2, 3];
  for (const campo of campos) {
    if (!validarDVModulo10(campo, linha)) {
      return {
        ok: false,
        erro: `Dígito verificador inválido no campo ${campo} - possível erro de digitação`,
      };
    }
  }
  if (!validarDVModulo11(linha)) {
    return {
      ok: false,
      erro: "Dígito verificador inválido no campo 4 - possível erro de digitação",
    };
  }

  const fatorVencimento = extrairFatorVencimento(linha);
  const valor = extrairValor(linha);
  const dataVencimento = calcularDataVencimento(fatorVencimento);
  const codigoBarras = montarCodigoBarras(linha);

  return {
    ok: true,
    dados: {
      linha,
      linhaFormatada: formatarLinha(linha),
      banco: extrairBanco(linha),
      valor,
      valorFormatado: formatarMoeda(valor),
      fatorVencimento,
      dataVencimento,
      dataVencimentoFormatada: formatarData(dataVencimento),
      codigoBarras,
      codigoBarrasFormatado: formatarCodigoBarras(codigoBarras),
    },
  };
}
