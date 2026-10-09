"use client";

/** Toast simples de confirmação — some automaticamente (controlado pela página). */
export default function Toast({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 animate-fade-in-up rounded-xl border border-emerald-400/30 bg-slate-900/95 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl shadow-black/60 backdrop-blur"
    >
      {mensagem}
    </div>
  );
}
