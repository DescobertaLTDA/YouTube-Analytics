// lib/rpm-csv-parser.ts
const COL_ID = "Conteúdo";
const COL_TITLE = "Título do vídeo";  // <-- NOVO
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

export function parseRpmCsv(csvText: string) {
  const normalized = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    throw new Error("CSV vazio.");
  }

  const header = parseCsvLine(lines[0]);
  const idIdx = header.indexOf(COL_ID);
  const titleIdx = header.indexOf(COL_TITLE);  // <-- NOVO
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

  const rows: any[] = [];
  let skipped = 0;
  let totalRow = null;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const videoId = (fields[idIdx] || "").trim();
    const title = (fields[titleIdx] || "").trim();  // <-- NOVO

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
      title: title,  // <-- NOVO
      rpm,
      receita,
      views,
    });
  }

  return { rows, skipped, totalRow };
}
