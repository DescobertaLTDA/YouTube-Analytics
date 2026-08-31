// lib/rpm-csv-parser.ts

export type ParsedRpmRow = {
  youtube_video_id: string;
  title: string;
  rpm: number;
  receita: number | null;
  views: number | null;
};

export type ParseRpmCsvResult = {
  rows: ParsedRpmRow[];
  skipped: number;
  totalRow: { views: number | null; receita: number | null; rpm: number | null } | null;
};

const COL_ID = "Conteúdo";
const COL_TITLE = "Título do vídeo";  // <-- ESSA LINHA É CRUCIAL
const COL_RPM = "RPM (BRL)";
const COL_RECEITA = "Receita estimada (BRL)";
const COL_VIEWS = "Visualizações";

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

export function parseRpmCsv(csvText: string): ParseRpmCsvResult {
  const normalized = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    throw new Error("CSV vazio.");
  }

  const header = parseCsvLine(lines[0]);
  const idIdx = header.indexOf(COL_ID);
  const titleIdx = header.indexOf(COL_TITLE);  // <-- ESSA LINHA É CRUCIAL
  const rpmIdx = header.indexOf(COL_RPM);
  const receitaIdx = header.indexOf(COL_RECEITA);
  const viewsIdx = header.indexOf(COL_VIEWS);

  if (idIdx === -1) {
    throw new Error(`Coluna "${COL_ID}" não encontrada no CSV.`);
  }
  if (rpmIdx === -1) {
    throw new Error(
      `Coluna "${COL_RPM}" não encontrada no CSV. Reexporte usando o relatório de Receita (aba Conteúdo) com as colunas de monetização.`
    );
  }

  const rows: ParsedRpmRow[] = [];
  let skipped = 0;
  let totalRow: ParseRpmCsvResult["totalRow"] = null;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const videoId = (fields[idIdx] || "").trim();
    const title = (fields[titleIdx] || "").trim();  // <-- ESSA LINHA É CRUCIAL

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
      skipped++;
      continue;
    }

    rows.push({
      youtube_video_id: videoId,
      title: title,  // <-- ESSA LINHA É CRUCIAL
      rpm,
      receita,
      views,
    });
  }

  return { rows, skipped, totalRow };
}
