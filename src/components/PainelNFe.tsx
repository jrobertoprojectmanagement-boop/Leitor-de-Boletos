"use client";

import { useRef, useState, type ReactNode } from "react";

import BotaoCopiar from "@/components/BotaoCopiar";
import { analisarNFe, gerarCSVNFe, type DadosNFe } from "@/utils/nfe";

interface Props {
  /** NF-e lida (controlada pela página — permite reabrir pelo histórico). */
  dados: DadosNFe | null;
  /** Chamado quando um XML é lido com sucesso (a página grava o histórico). */
  onDados: (dados: DadosNFe) => void;
  /** Toast compartilhado com a página. */
  mostrarToast: (mensagem: string, variante?: "sucesso" | "erro") => void;
}

type ChaveCopiaNFe =
  | "cnpj"
  | "razao"
  | "numero"
  | "serie"
  | "emissao"
  | "valor"
  | "chave";

/** Card de informação da NF-e, no mesmo visual dark glassmorphism dos boletos. */
function CardNFe({
  rotulo,
  valor,
  subtitulo,
  icone,
  caixa,
  corIcone,
  corSubtitulo,
  copiarRotulo,
  copiarAtivo,
  onCopiar,
}: {
  rotulo: string;
  valor: string;
  subtitulo?: string;
  icone: ReactNode;
  caixa: string;
  corIcone: string;
  corSubtitulo: string;
  copiarRotulo: string;
  copiarAtivo: boolean;
  onCopiar: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${caixa}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`flex items-center gap-2 ${corIcone}`}>
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
            {icone}
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            {rotulo}
          </span>
        </div>
        <BotaoCopiar
          ativo={copiarAtivo}
          rotulo={copiarRotulo}
          onClick={onCopiar}
        />
      </div>
      <p className="mt-2.5 truncate text-lg font-bold leading-tight text-white">
        {valor}
      </p>
      {subtitulo && (
        <p className={`mt-0.5 text-xs ${corSubtitulo}`}>{subtitulo}</p>
      )}
    </div>
  );
}

/** Dispara o download de um arquivo gerado no navegador. */
function baixar(nome: string, tipo: string, conteudo: string | Blob) {
  const blob =
    conteudo instanceof Blob
      ? conteudo
      : new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PainelNFe({ dados, onDados, mostrarToast }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [copiadoEm, setCopiadoEm] = useState<ChaveCopiaNFe | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerCopia = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copiar(chave: ChaveCopiaNFe, texto: string) {
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

  async function processarArquivo(arquivo: File) {
    if (!arquivo.name.toLowerCase().endsWith(".xml")) {
      const mensagem = "Selecione um arquivo no formato .xml";
      setErro(mensagem);
      mostrarToast(`✗ ${mensagem}`, "erro");
      return;
    }
    try {
      const conteudo = await arquivo.text();
      const resposta = analisarNFe(conteudo);
      if (!resposta.ok) {
        setErro(resposta.erro);
        mostrarToast(`✗ ${resposta.erro}`, "erro");
        return;
      }
      setErro(null);
      onDados(resposta.dados);
      mostrarToast("✓ XML lido com sucesso!");
    } catch {
      const mensagem = "Não foi possível ler o arquivo. Tente novamente.";
      setErro(mensagem);
      mostrarToast(`✗ ${mensagem}`, "erro");
    }
  }

  function exportarCsv() {
    if (!dados) return;
    baixar(
      `nfe-${dados.numero}.csv`,
      "text/csv",
      "\uFEFF" + gerarCSVNFe(dados)
    );
    mostrarToast("✓ Arquivo CSV exportado!");
  }


  async function exportarXlsx() {
    if (!dados) return;
    try {
      // Import dinâmico: a lib só carrega quando o usuário exporta.
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["NF-e", dados.numero],
          ["Série", dados.serie],
          ["Data de emissão", dados.dataEmissao],
          ["CNPJ emitente", dados.cnpjFormatado],
          ["Razão social emitente", dados.razaoSocial],
          ["Valor total", dados.valorTotal],
          ["Chave de acesso", dados.chave],
          ["Total de itens", dados.totalItens],
        ]),
        "NF-e"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Código", "Produto", "Quantidade", "V. Unitário", "V. Total"],
          ...dados.itens.map((item) => [
            item.cProd,
            item.xProd,
            Number(item.qCom.replace(",", ".")),
            Number(item.vUnCom.replace(",", ".")),
            item.vProd,
          ]),
        ]),
        "Itens"
      );
      XLSX.writeFile(wb, `nfe-${dados.numero}.xlsx`);
      mostrarToast("✓ Arquivo XLSX exportado!");
    } catch {
      mostrarToast("✗ Não foi possível gerar o XLSX — tente o CSV", "erro");
    }
  }


  return (
    <div>
      <label
        htmlFor="xml-nfe"
        className="mb-2 block text-sm font-medium text-slate-300"
      >
        Arquivo XML da NF-e
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const arquivo = e.dataTransfer.files?.[0];
          if (arquivo) void processarArquivo(arquivo);
        }}
        className={`rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          arrastando
            ? "border-blue-400/70 bg-blue-500/10"
            : "border-white/15 bg-slate-950/70 hover:border-white/25"
        }`}
      >
        <input
          id="xml-nfe"
          ref={inputRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void processarArquivo(arquivo);
            e.target.value = "";
          }}
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto h-10 w-10 text-slate-500"
          aria-hidden
        >
          <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
          <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-200">
          Arraste o XML aqui
        </p>
        <p className="mt-1 text-xs text-slate-500">ou</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Selecionar XML
        </button>
        <p className="mt-3 text-xs text-slate-500">
          Aceita apenas .xml — o arquivo não sai do seu navegador.
        </p>
      </div>


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
              Não foi possível ler a NF-e
            </p>
            <p className="mt-0.5 text-sm text-red-300/90">{erro}</p>
          </div>
        </div>
      )}


      {dados && (
        <section
          aria-live="polite"
          className="mt-6 animate-fade-in-up border-t border-white/10 pt-6"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Resultado da leitura · NF-e {dados.numero}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportarCsv}
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
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={() => void exportarXlsx()}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
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
                Exportar XLSX
              </button>
            </div>
          </div>


          <div className="grid gap-3 sm:grid-cols-3">
            <CardNFe
              rotulo="CNPJ Emitente"
              valor={dados.cnpjFormatado}
              subtitulo={dados.razaoSocial}
              icone={<path d="M3 10 12 4l9 6M5 10v9m5-9v9m4-9v9m5-9v9M3 21h18" />}
              caixa="border-sky-500/25 bg-sky-500/10"
              corIcone="text-sky-300"
              corSubtitulo="text-sky-300/70"
              copiarRotulo="Copiar CNPJ"
              copiarAtivo={copiadoEm === "cnpj"}
              onCopiar={() => copiar("cnpj", dados.cnpj)}
            />
            <CardNFe
              rotulo="Número NF-e"
              valor={dados.numero}
              subtitulo={`Série ${dados.serie}`}
              icone={<path d="M7 3h8l4 4v14H7zM15 3v4h4" />}
              caixa="border-blue-500/25 bg-blue-500/10"
              corIcone="text-blue-300"
              corSubtitulo="text-blue-300/70"
              copiarRotulo="Copiar número"
              copiarAtivo={copiadoEm === "numero"}
              onCopiar={() => copiar("numero", dados.numero)}
            />
            <CardNFe
              rotulo="Valor Total"
              valor={dados.valorTotalFormatado}
              subtitulo={`${dados.totalItens} ${
                dados.totalItens === 1 ? "item" : "itens"
              }`}
              icone={
                <>
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2.5" />
                </>
              }
              caixa="border-emerald-500/25 bg-emerald-500/10"
              corIcone="text-emerald-300"
              corSubtitulo="text-emerald-300/70"
              copiarRotulo="Copiar valor total"
              copiarAtivo={copiadoEm === "valor"}
              onCopiar={() => copiar("valor", dados.valorTotalFormatado)}
            />
            <CardNFe
              rotulo="Razão Social"
              valor={dados.razaoSocial}
              subtitulo="Emitente"
              icone={
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              }
              caixa="border-indigo-500/25 bg-indigo-500/10"
              corIcone="text-indigo-300"
              corSubtitulo="text-indigo-300/70"
              copiarRotulo="Copiar razão social"
              copiarAtivo={copiadoEm === "razao"}
              onCopiar={() => copiar("razao", dados.razaoSocial)}
            />
            <CardNFe
              rotulo="Série"
              valor={dados.serie}
              subtitulo={`NF-e nº ${dados.numero}`}
              icone={<path d="M4 6h16M4 12h16M4 18h10" />}
              caixa="border-amber-500/25 bg-amber-500/10"
              corIcone="text-amber-300"
              corSubtitulo="text-amber-300/70"
              copiarRotulo="Copiar série"
              copiarAtivo={copiadoEm === "serie"}
              onCopiar={() => copiar("serie", dados.serie)}
            />
            <CardNFe
              rotulo="Data Emissão"
              valor={dados.dataEmissao}
              subtitulo={dados.horaEmissao ? `às ${dados.horaEmissao}` : "—"}
              icone={
                <>
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M3 10h18" />
                </>
              }
              caixa="border-rose-500/25 bg-rose-500/10"
              corIcone="text-rose-300"
              corSubtitulo="text-rose-300/70"
              copiarRotulo="Copiar data de emissão"
              copiarAtivo={copiadoEm === "emissao"}
              onCopiar={() => copiar("emissao", dados.dataEmissao)}
            />
          </div>


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
                  Chave de acesso
                </span>
              </div>
              <BotaoCopiar
                ativo={copiadoEm === "chave"}
                rotulo="Copiar chave de acesso"
                onClick={() => copiar("chave", dados.chave)}
              />
            </div>
            <p className="mt-3 break-all font-mono text-sm tracking-wider text-violet-100 sm:text-base">
              {dados.chaveFormatada}
            </p>
          </div>


          <div className="mt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Itens da NF-e · {dados.totalItens}{" "}
              {dados.totalItens === 1 ? "item" : "itens"}
            </h3>
            {dados.itens.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.04] text-[11px] uppercase tracking-wider text-slate-400">
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Cód
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Produto
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-semibold"
                      >
                        Qtd
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-semibold"
                      >
                        V. Unit
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-semibold"
                      >
                        V. Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.itens.map((item, indice) => (
                      <tr
                        key={`${item.cProd}-${indice}`}
                        className="border-b border-white/5 text-slate-200 last:border-0 hover:bg-white/[0.03]"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                          {item.cProd || "—"}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-medium">
                          {item.xProd || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {item.qComFormatada}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {item.vUnComFormatado}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-300">
                          {item.vProdFormatado}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white/[0.04] text-slate-300">
                      <td
                        colSpan={4}
                        className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                      >
                        Total de itens: {dados.totalItens}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-white">
                        {dados.valorTotalFormatado}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                Esta NF-e não possui itens para exibir.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

