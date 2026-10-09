"use client";

import { useEffect, useRef, useState } from "react";

import BotaoCopiar from "@/components/BotaoCopiar";
import PainelNFe from "@/components/PainelNFe";
import Toast from "@/components/Toast";
import {
  analisarBoleto,
  formatarLinha,
  type DadosBoleto,
} from "@/utils/boleto";
import type { DadosNFe } from "@/utils/nfe";

// Linha de exemplo com todos os DVs válidos (campo 4 = 2, módulo 11).
const EXEMPLO = "34191.79001 01043.510047 91020.150008 2 89110000012345";
const CHAVE_HISTORICO = "leitor-boletos:historico";

type Aba = "boleto" | "nfe";
type ChaveCopia = "banco" | "valor" | "vencimento" | "codigo";
type VarianteToast = "sucesso" | "erro";

/** Entrada de histórico da aba Boleto. */
interface ItemHistoricoBoleto {
  tipo: "boleto";
  id: string;
  linha: string;
  bancoCodigo: string;
  bancoNome: string;
  valorFormatado: string;
  vencimento: string;
  timestamp: number;
}

/** Entrada de histórico da aba NF-e (guarda os dados para reabrir). */
interface ItemHistoricoNFe {
  tipo: "nfe";
  id: string;
  numero: string;
  emitente: string;
  valorFormatado: string;
  dados: DadosNFe;
  timestamp: number;
}

type ItemHistorico = ItemHistoricoBoleto | ItemHistoricoNFe;

/** Migra itens antigos (só boleto, sem o campo `tipo`) para o formato unificado. */
function normalizarItemHistorico(bruto: unknown): ItemHistorico | null {
  if (!bruto || typeof bruto !== "object") return null;
  const item = bruto as Record<string, unknown>;
  const timestamp =
    typeof item.timestamp === "number" ? item.timestamp : Date.now();

  if (item.tipo === "nfe") {
    if (typeof item.numero !== "string" || !item.dados) return null;
    return {
      tipo: "nfe",
      id: typeof item.id === "string" ? item.id : item.numero,
      numero: item.numero,
      emitente: typeof item.emitente === "string" ? item.emitente : "",
      valorFormatado:
        typeof item.valorFormatado === "string" ? item.valorFormatado : "",
      dados: item.dados as DadosNFe,
      timestamp,
    };
  }

  if (typeof item.linha !== "string" || item.linha.length !== 47) return null;
  return {
    tipo: "boleto",
    id: item.linha,
    linha: item.linha,
    bancoCodigo: String(item.bancoCodigo ?? ""),
    bancoNome: String(item.bancoNome ?? ""),
    valorFormatado: String(item.valorFormatado ?? ""),
    vencimento: String(item.vencimento ?? ""),
    timestamp,
  };
}

function formatarMomento(timestamp: number): string {
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [aba, setAba] = useState<Aba>("boleto");
  const [linha, setLinha] = useState("");
  const [resultado, setResultado] = useState<DadosBoleto | null>(null);
  const [nfe, setNfe] = useState<DadosNFe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    mensagem: string;
    variante: VarianteToast;
  } | null>(null);
  const [copiadoEm, setCopiadoEm] = useState<ChaveCopia | null>(null);
  const [historico, setHistorico] = useState<ItemHistorico[]>([]);
  const timerToast = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerCopia = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vazio = linha.trim().length === 0;

  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE_HISTORICO);
      if (bruto) {
        const lista = JSON.parse(bruto) as unknown[];
        const valida = lista
          .map(normalizarItemHistorico)
          .filter((item): item is ItemHistorico => item !== null);
        setHistorico(valida.slice(0, 5));
      }
    } catch {
      // localStorage indisponível — segue sem histórico
    }
  }, []);

  function aoMudarLinha(valor: string) {
    setLinha(valor);
    setResultado(null);
    setErro(null);
    setCopiadoEm(null);
  }

  function mostrarToast(mensagem: string, variante: VarianteToast = "sucesso") {
    if (timerToast.current) clearTimeout(timerToast.current);
    setToast({ mensagem, variante });
    timerToast.current = setTimeout(() => setToast(null), 2000);
  }

  function gravarHistorico(novo: ItemHistorico) {
    setHistorico((atual) => {
      const lista = [
        novo,
        ...atual.filter((item) => item.id !== novo.id),
      ].slice(0, 5);
      try {
        window.localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(lista));
      } catch {
        // armazenamento indisponível
      }
      return lista;
    });
  }

  function analisar(valorLinha: string) {
    const resposta = analisarBoleto(valorLinha);
    setCopiadoEm(null);
    if (resposta.ok) {
      setErro(null);
      setResultado(resposta.dados);
      gravarHistorico({
        tipo: "boleto",
        id: resposta.dados.linha,
        linha: resposta.dados.linha,
        bancoCodigo: resposta.dados.banco.codigo,
        bancoNome: resposta.dados.banco.nome,
        valorFormatado: resposta.dados.valorFormatado,
        vencimento: resposta.dados.dataVencimentoFormatada,
        timestamp: Date.now(),
      });
    } else {
      setResultado(null);
      setErro(resposta.erro);
    }
  }

  function aoLerNFe(dados: DadosNFe) {
    setNfe(dados);
    gravarHistorico({
      tipo: "nfe",
      id: dados.chave || dados.numero,
      numero: dados.numero,
      emitente: dados.razaoSocial || dados.cnpjFormatado,
      valorFormatado: dados.valorTotalFormatado,
      dados,
      timestamp: Date.now(),
    });
  }

  function trocarAba(nova: Aba) {
    setAba(nova);
    setErro(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (vazio) return;
    analisar(linha);
  }

  function reaplicar(item: ItemHistorico) {
    if (item.tipo === "nfe") {
      setAba("nfe");
      setNfe(item.dados);
      setErro(null);
      return;
    }
    setAba("boleto");
    setLinha(formatarLinha(item.linha));
    setErro(null);
    analisar(item.linha);
  }

  function limparHistorico() {
    setHistorico([]);
    try {
      window.localStorage.removeItem(CHAVE_HISTORICO);
    } catch {
      // armazenamento indisponível
    }
    mostrarToast("✓ Histórico limpo");
  }

  function copiar(chave: ChaveCopia, texto: string) {
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiadoEm(chave);
        if (timerCopia.current) clearTimeout(timerCopia.current);
        timerCopia.current = setTimeout(() => setCopiadoEm(null), 1500);
        mostrarToast("✓ Copiado!");
      })
      .catch(() => undefined);
  }

  function exportarTxt() {
    if (!resultado) return;

    const conteudo = [
      `Boleto ${resultado.banco.nome} - ${resultado.valorFormatado} - Venc ${resultado.dataVencimentoFormatada}`,
      "------------------------------------------",
      `Linha digitável: ${resultado.linhaFormatada}`,
      `Banco: ${resultado.banco.codigo} - ${resultado.banco.nome}`,
      `Valor: ${resultado.valorFormatado}`,
      `Vencimento: ${resultado.dataVencimentoFormatada}`,
      `Fator de vencimento: ${resultado.fatorVencimento}`,
      `Código de barras (44 dígitos): ${resultado.codigoBarras}`,
      `Exportado em: ${new Date().toLocaleString("pt-BR")}`,
      "",
    ].join("\r\n");

    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const sufixo =
      resultado.dataVencimentoFormatada.replace(/\D/g, "") || "sem-vencimento";
    link.href = url;
    link.download = `boleto-${resultado.banco.codigo}-${sufixo}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    mostrarToast("✓ Arquivo exportado!");
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Orbes decorativos */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute right-[-160px] top-[38%] h-[360px] w-[360px] animate-float rounded-full bg-indigo-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute bottom-[-140px] left-[-120px] h-[340px] w-[340px] animate-float rounded-full bg-sky-500/10 blur-3xl [animation-delay:1.5s]"
      />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-900/40">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-5 w-5 text-white"
                aria-hidden
              >
                <path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v14" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">
              Leitor de Boletos
            </span>
          </div>
          <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
            Fase 4
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        {/* Hero */}
        <section className="animate-fade-in-up text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            {aba === "boleto"
              ? "Análise inteligente de boletos"
              : "Leitura de XML de NF-e"}
          </span>

          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-white sm:text-6xl">
            {aba === "boleto" ? (
              <>
                Leitor de Boletos{" "}
                <span className="text-gradient">Inteligente</span>
              </>
            ) : (
              <>
                Leitor de NF-e{" "}
                <span className="text-gradient">Inteligente</span>
              </>
            )}
          </h1>

          <p className="text-balance mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            {aba === "boleto"
              ? "Cole a linha digitável do seu boleto e extraia as informações importantes em segundos. Rápido, seguro e sem complicações."
              : "Envie o XML da sua NF-e e extraia emitente, valores e itens em segundos. Tudo no seu navegador."}
          </p>
        </section>

        {/* Abas Boleto / NF-e */}
        <section
          className="mt-10 flex animate-fade-in-up justify-center [animation-delay:0.1s]"
          aria-label="Tipo de documento"
        >
          <div
            role="tablist"
            className="flex rounded-2xl border border-white/10 bg-white/5 p-1.5 shadow-xl shadow-black/30 backdrop-blur-xl"
          >
            {(
              [
                {
                  id: "boleto" as Aba,
                  rotulo: "BOLETO",
                  icone: (
                    <path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v14" />
                  ),
                },
                {
                  id: "nfe" as Aba,
                  rotulo: "NF-e",
                  icone: (
                    <path d="M7 3h8l4 4v14H7zM15 3v4h4" />
                  ),
                },
              ] as const
            ).map((item) => {
              const ativa = aba === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => trocarAba(item.id)}
                  className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-400/60 ${
                    ativa
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    {item.icone}
                  </svg>
                  {item.rotulo}
                </button>
              );
            })}
          </div>
        </section>
        {/* Card de análise */}
        <section className="mt-12 animate-fade-in-up [animation-delay:0.15s]">
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-blue-950/50 backdrop-blur-xl sm:p-8">
            {aba === "boleto" ? (
              <>
                <form onSubmit={handleSubmit}>
                  <label
                    htmlFor="linha-digitavel"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Linha digitável do boleto
                  </label>

                  <textarea
                    id="linha-digitavel"
                    value={linha}
                    onChange={(e) => aoMudarLinha(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={EXEMPLO}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4 font-mono text-base tracking-wide text-white placeholder:text-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-lg"
                  />

              <div className="mt-2 flex items-start justify-between gap-4">
                  <p className="text-xs text-slate-500">
                    Cole a sequência com 47 dígitos, como{" "}
                    <span className="font-mono text-slate-400">
                      34191.79001 01043.510047...
                    </span>
                  </p>
                  {!vazio && (
                    <button
                      type="button"
                      onClick={() => aoMudarLinha("")}
                      className="shrink-0 text-xs text-slate-500 transition hover:text-slate-300"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={vazio}
                  className="group mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-800/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5 transition group-hover:scale-110"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  Analisar Boleto
                </button>

                {erro && (
                  <div
                    role="alert"
                    className="mt-6 flex animate-fade-in-up items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-red-200">
                        Não foi possível analisar
                      </p>
                      <p className="mt-0.5 text-sm text-red-300/90">{erro}</p>
                    </div>
                  </div>
                )}

                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                    aria-hidden
                  >
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Seus dados ficam no seu navegador — nada é enviado.
                </p>
              </form>

              {resultado && (
                <section
                  aria-live="polite"
                  className="mt-6 animate-fade-in-up border-t border-white/10 pt-6"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Resultado da análise
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={exportarTxt}
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 transition hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                        aria-hidden
                      >
                        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                      </svg>
                      Exportar TXT
                    </button>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                        aria-hidden
                      >
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                      Concluído
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {/* Banco */}
                  <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sky-300">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden
                        >
                          <path d="M3 10 12 4l9 6M5 10v9m5-9v9m4-9v9m5-9v9M3 21h18" />
                        </svg>
                        <span className="text-[11px] font-semibold uppercase tracking-wider">
                          Banco
                        </span>
                      </div>
                      <BotaoCopiar
                        ativo={copiadoEm === "banco"}
                        rotulo="Copiar banco"
                        onClick={() =>
                          copiar(
                            "banco",
                            `${resultado.banco.codigo} - ${resultado.banco.nome}`
                          )
                        }
                      />
                    </div>
                    <p className="mt-2.5 text-lg font-bold leading-tight text-white">
                      {resultado.banco.nome}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-sky-300/70">
                      Código {resultado.banco.codigo}
                    </p>
                  </div>

                  {/* Valor */}
                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden
                        >
                          <rect x="2" y="6" width="20" height="12" rx="2" />
                          <circle cx="12" cy="12" r="2.5" />
                          <path d="M6 12h.01M18 12h.01" />
                        </svg>
                        <span className="text-[11px] font-semibold uppercase tracking-wider">
                          Valor
                        </span>
                      </div>
                      <BotaoCopiar
                        ativo={copiadoEm === "valor"}
                        rotulo="Copiar valor"
                        onClick={() => copiar("valor", resultado.valorFormatado)}
                      />
                    </div>
                    <p className="mt-2.5 text-lg font-bold leading-tight text-white">
                      {resultado.valorFormatado}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-300/70">
                      Valor do documento
                    </p>
                  </div>

                  {/* Vencimento */}
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-amber-300">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden
                        >
                          <rect x="3" y="5" width="18" height="16" rx="2" />
                          <path d="M8 3v4M16 3v4M3 10h18" />
                        </svg>
                        <span className="text-[11px] font-semibold uppercase tracking-wider">
                          Vencimento
                        </span>
                      </div>
                      <BotaoCopiar
                        ativo={copiadoEm === "vencimento"}
                        rotulo="Copiar vencimento"
                        onClick={() =>
                          copiar("vencimento", resultado.dataVencimentoFormatada)
                        }
                      />
                    </div>
                    <p className="mt-2.5 text-lg font-bold leading-tight text-white">
                      {resultado.dataVencimentoFormatada}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-300/70">
                      Fator de vencimento {resultado.fatorVencimento}
                    </p>
                  </div>
                </div>

                {/* Código de barras */}
                <div className="mt-3 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-violet-300">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden
                      >
                        <path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v14" />
                      </svg>
                      <span className="text-[11px] font-semibold uppercase tracking-wider">
                        Código de barras
                      </span>
                    </div>
                    <BotaoCopiar
                      ativo={copiadoEm === "codigo"}
                      rotulo="Copiar código de barras"
                      onClick={() => copiar("codigo", resultado.codigoBarras)}
                    />
                  </div>
                  <p className="mt-3 break-all font-mono text-sm tracking-wider text-violet-100 sm:text-base">
                    {resultado.codigoBarrasFormatado}
                  </p>
                </div>
              </section>
            )}
          </>
        ) : (
          <PainelNFe
            dados={nfe}
            onDados={aoLerNFe}
            mostrarToast={mostrarToast}
          />
        )}

            {historico.length > 0 && (
              <section className="mt-6 border-t border-white/10 pt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Histórico recente
                  </h2>
                  <button
                    type="button"
                    onClick={limparHistorico}
                    className="text-xs text-slate-500 transition hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                  >
                    Limpar histórico
                  </button>
                </div>
                <ul className="space-y-2">
                  {historico.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => reaplicar(item)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left transition hover:border-blue-500/40 hover:bg-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                      >
                        {item.tipo === "boleto" ? (
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="shrink-0 rounded-md border border-sky-400/30 bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">
                              BOLETO
                            </span>
                            <span className="truncate text-sm font-medium text-slate-200">
                              {item.bancoNome}
                            </span>
                          </span>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="shrink-0 rounded-md border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-300">
                              NF-e
                            </span>
                            <span className="truncate text-sm font-medium text-slate-200">
                              {item.numero}
                              {item.emitente ? ` · ${item.emitente}` : ""}
                            </span>
                          </span>
                        )}
                        <span className="flex shrink-0 items-center gap-3 text-xs">
                          <span className="font-medium text-emerald-300">
                            {item.valorFormatado}
                          </span>
                          {item.tipo === "boleto" && (
                            <span className="hidden text-slate-400 sm:inline">
                              Venc {item.vencimento}
                            </span>
                          )}
                          <span className="text-slate-500">
                            {formatarMomento(item.timestamp)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </section>
        {/* Recursos */}
        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            {
              titulo: "Leitura instantânea",
              descricao:
                "Extraia banco, vencimento, valor e beneficiário em poucos segundos.",
              icone: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />,
              cor: "from-blue-500/20 to-blue-600/5 text-blue-400",
            },
            {
              titulo: "100% seguro",
              descricao:
                "O boleto nunca sai do seu dispositivo. Privacidade em primeiro lugar.",
              icone: (
                <path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3z" />
              ),
              cor: "from-emerald-500/20 to-emerald-600/5 text-emerald-400",
            },
            {
              titulo: "Qualquer banco",
              descricao:
                "Compatível com linha digitável de boletos de todos os bancos.",
              icone: <path d="M3 10 12 4l9 6M5 10v9m5-9v9m4-9v9m5-9v9M3 21h18" />,
              cor: "from-indigo-500/20 to-indigo-600/5 text-indigo-400",
            },
          ].map((recurso) => (
            <div
              key={recurso.titulo}
              className="group rounded-2xl border border-white/5 bg-white/[0.03] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-white/10 hover:bg-white/[0.06]"
            >
              <div
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${recurso.cor} transition group-hover:scale-105`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden
                >
                  {recurso.icone}
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white">
                {recurso.titulo}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                {recurso.descricao}
              </p>
            </div>
          ))}
        </section>
        {/* Como funciona */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Como funciona
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                passo: "1",
                titulo: "Cole a linha",
                texto:
                  "Copie a linha digitável do boleto e cole no campo acima.",
              },
              {
                passo: "2",
                titulo: "Clique em Analisar",
                texto: "Pressione o botão para processar o código.",
              },
              {
                passo: "3",
                titulo: "Veja os dados",
                texto: "Receba as informações organizadas de forma clara.",
              },
            ].map((etapa) => (
              <div
                key={etapa.passo}
                className="relative rounded-2xl border border-white/5 bg-white/[0.03] p-6"
              >
                <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-blue-900/40">
                  {etapa.passo}
                </span>
                <h3 className="text-base font-semibold text-white">
                  {etapa.titulo}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  {etapa.texto}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-slate-950/50 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Leitor de Boletos Inteligente</p>
          <p>
            Feito com <span className="text-blue-400">Next.js 14</span> +{" "}
            <span className="text-sky-400">Tailwind CSS</span>
          </p>
        </div>
      </footer>

      {toast && (
        <Toast
          key={toast.mensagem}
          mensagem={toast.mensagem}
          variante={toast.variante}
        />
      )}
    </div>
  );
}
