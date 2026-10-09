# Leitor Mágico de Boletos e NF-e

> **5 minutos digitando viram 5 segundos.** Elimine multas por erro de digitação no financeiro.

Todo financeiro perde horas copiando linha digitável e dados de NF-e para planilha/ERP. Um dígito errado = pagamento duplicado ou juros. O Leitor Mágico automatiza isso: cole a linha ou o XML e gere arquivo pronto para importar.

**Live Demo:** `em breve na Vercel` | **Stack:** Next.js 14 + TypeScript + Tailwind

> 📸 Print da exportação TXT validada - Fase 3 (Itaú R$123,45 - Venc 01/03/2022)

---

### 🚀 Para Empresas e Escritórios

**Dor que resolvemos:** Digitação manual, lenta e com risco de multa.

**Como funciona hoje (Fase 3):**
1. Copie a linha digitável do boleto (47 ou 48 dígitos)
2. Cole no Leitor Mágico
3. Veja na hora: Banco, Valor, Vencimento, Código de barras validado
4. Copie qualquer campo com 1 clique ou baixe o TXT formatado

**Resultado:** De 5 minutos por boleto para 5 segundos, sem erro.

**Ideal para:** Escritórios de contabilidade, BPO Financeiro, MEIs e pequenas empresas que não têm ERP caro com leitura nativa.

---

### 💻 Para Devs e Recrutadores

Este projeto foi construído para ser rigoroso tecnicamente, não só um decodificador visual.

**Decisões técnicas importantes:**
- **Validação FEBRABAN:** Implementação de Módulo 10 (campos 1,2,3) e Módulo 11 (código de barras / campo 4) para garantir que a linha digitável é válida antes de decodificar.
- **Cálculo de Vencimento:** Cálculo do Fator de Vencimento com suporte ao ciclo 2 (após 21/02/2025, fator > 9999), evitando datas erradas que a maioria dos decodificadores gratuitos erra.
- **UX de Produto:** Toast de feedback, histórico em localStorage (últimas 5), exportação TXT formatada, design system dark glassmorphism.
- **Stack Leve:** Next.js 14 (App Router), TypeScript, Tailwind CSS. Deploy direto na Vercel com custo operacional zero na fase inicial.

**Como rodar local:**
```bash
npm install
npm run dev
# http://localhost:3000
```

**Roadmap de Produto:**
- [x] **Fase 1-3:** Leitor de Boletos (linha digitável, validação DV, export TXT, histórico)
- [x] **Fase 4:** Aba NF-e - Upload XML, extração de CNPJ, nº, valor, itens + export CSV/XLSX
- [ ] **Fase 5:** Lote + OCR - Colar 20 boletos de uma vez e ler PDF/foto do boleto por câmera
- [ ] **Fase 6:** Geração CNAB 240/400 para remessa bancária

**Próximos passos técnicos:** Testes unitários para os algoritmos de DV, leitura em lote e OCR com Tesseract.js.

---
Feito por **José Roberto** - Salvador/BA - em construção com IA (Mimo/MiMo) e validação humana.
