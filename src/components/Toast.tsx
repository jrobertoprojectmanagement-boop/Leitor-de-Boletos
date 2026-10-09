"use client";

/** Toast simples de confirmação — some automaticamente (controlado pela página). */
export default function Toast({
  mensagem,
  variante = "sucesso",
}: {
  mensagem: string | null;
  variante?: "sucesso" | "erro";
}) {
  if (!mensagem) return null;

  const estilo =
    variante === "erro"
      ? "border-red-400/30 text-red-300"
      : "border-emerald-400/30 text-emerald-300";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-50 animate-fade-in-up rounded-xl border bg-slate-900/95 px-4 py-3 text-sm font-medium shadow-2xl shadow-black/60 backdrop-blur ${estilo}`}
    >
      {mensagem}
    </div>
  );
}
