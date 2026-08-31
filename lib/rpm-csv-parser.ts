// Parser do "Dados da tabela.csv" exportado do YouTube Studio (aba
// Conteúdo, relatório "Receita"). Usado pela importação de RPM real
// (ver plano: Parte 3 = endpoint de upload, Parte 5 = usar esse RPM no
// cálculo de ganhos).
//
// Esse export tem uma coluna por vídeo (linha "Total" = soma do canal,
// que é ignorada aqui) e traz, entre outras, as colunas:
//   Conteúdo                  -> id do vídeo no YouTube
//   RPM (BRL)                 -> RPM real do vídeo no período
//   Receita estimada (BRL)    -> receita do vídeo no período
//   Visualizações             -> views do vídeo no período
//
// O parser é feito por NOME de coluna (não por posição fixa), porque o
// YouTube Studio já mudou a ordem/quantidade de colunas entre exports
// (o export "simples" não tem RPM; o "completo" tem). Se a coluna RPM
// não existir no arquivo, o parser lança um erro claro em vez de
// silenciosamente devolver lixo.

export type ParsedRpmRow = {
  youtube_video_id: string;
  rpm: number;
  receita: number | null;
  views: number | null;
};

export type ParseRpmCsvResult = {
  rows: ParsedRpmRow[];
  skipped: number; // linhas ignoradas (ex: sem RPM válido)
  totalRow: { views: number | null; receita: number | null; rpm: number | null } | null;
};

const COL_ID = "Conteúdo";
const COL_RPM = "RPM (BRL)";
const COL_RECEITA = "Receita estimada (BRL)";
const COL_VIEWS = "Visualizações";

/**
 * Faz o parse de uma linha de CSV respeitando aspas (campos com vírgula
 * ou aspas dentro, como títulos de vídeo e datas "Aug 19, 2026").
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (insideQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      insideQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Recebe o texto bruto do CSV e devolve o RPM/receita/views real por
 * vídeo. A linha "Total" (soma do canal) é excluída de `rows`, mas
 * devolvida separadamente em `totalRow` (útil pra conferência).
 */
export function parseRpmCsv(csvText: string): ParseRpmCsvResult {
  // Remove BOM (comum em CSV exportado do Google) e normaliza quebras de linha.
  const normalized = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    throw new Error("CSV vazio.");
  }

  const header = parseCsvLine(lines[0]);
  const idIdx = header.indexOf(COL_ID);
  const rpmIdx = header.indexOf(COL_RPM);
  const receitaIdx = header.indexOf(COL_RECEITA);
  const viewsIdx = header.indexOf(COL_VIEWS);

  if (idIdx === -1) {
    throw new Error(`Coluna "${COL_ID}" não encontrada no CSV.`);
  }
  if (rpmIdx === -1) {
    throw new Error(
      `Coluna "${COL_RPM}" não encontrada no CSV. Este parece ser o export "simples" do YouTube Studio, sem RPM por vídeo — reexporte usando o relatório de Receita (aba Conteúdo) com as colunas de monetização.`
    );
  }

  const rows: ParsedRpmRow[] = [];
  let skipped = 0;
  let totalRow: ParseRpmCsvResult["totalRow"] = null;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const videoId = (fields[idIdx] || "").trim();

    if (!videoId) {
      skipped++;
      continue;
    }

    const rpm = toNumberOrNull(fields[rpmIdx]);
    const receita = receitaIdx !== -1 ? toNumberOrNull(fields[receitaIdx]) : null;
    const views = viewsIdx !== -1 ? toNumberOrNull(fields[viewsIdx]) : null;

    if (videoId === "Total") {
      totalRow = { rpm, receita, views };
      continue;
    }

    if (rpm === null) {
      // Vídeo sem RPM válido no período (ex: sem monetização) — ignora
      // em vez de gravar um RPM inválido no banco.
      skipped++;
      continue;
    }

    rows.push({ youtube_video_id: videoId, rpm, receita, views });
  }

  return { rows, skipped, totalRow };
}
