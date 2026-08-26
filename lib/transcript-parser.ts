// Faz o parse de um transcript exportado pelo tactiq.io (o formato que o
// YouTube Studio/extensão gera), tipo:
//
//   # tactiq.io free youtube transcript
//   # 15 ROCHAS QUE PARECEM DE OUTRO MUNDO
//   # https://www.youtube.com/watch/QwI6teXG8Yg
//
//   00:00:00.160 Bilhões de anos de processos geológicos
//   00:00:03.000 esculpiram a crosta terrestre em
//   ...

const TIMESTAMP_LINE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+(.*)$/;
const YOUTUBE_ID_FROM_URL = /(?:watch\?v=|watch\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/;

// Heurística simples pra marcar linhas de "capítulo" dentro de um vídeo de
// lista (ex.: "Número 15. Óleo de tigre.") — útil pra navegar a minutagem
// sem ter que ler o transcript inteiro.
const CHAPTER_LINE = /^(N[uú]mero\s+\d+|Cap[ií]tulo\s+\d+|#\s*\d+)\b/i;

export type ParsedSegment = {
  order: number;
  timestampLabel: string;
  timestampSeconds: number;
  text: string;
  isChapter: boolean;
};

export type ParsedTranscript = {
  sourceTitle: string | null;
  youtubeVideoId: string | null;
  segments: ParsedSegment[];
  durationSeconds: number | null;
};

function timestampToSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

export function parseTactiqTranscript(raw: string): ParsedTranscript {
  const lines = raw.split(/\r?\n/);

  let sourceTitle: string | null = null;
  let youtubeVideoId: string | null = null;
  const segments: ParsedSegment[] = [];

  const headerLines = lines.filter((l) => l.trim().startsWith("#"));
  // A convenção do tactiq é: linha 1 = "# tactiq.io free youtube transcript",
  // linha 2 = título do vídeo, linha 3 = URL. Mas alguém pode colar sem a
  // primeira linha, então procuramos com mais cuidado em vez de indexar fixo.
  for (const line of headerLines) {
    const content = line.replace(/^#\s*/, "").trim();
    if (!content) continue;
    if (/^tactiq\.io/i.test(content)) continue;

    const urlMatch = content.match(YOUTUBE_ID_FROM_URL);
    if (urlMatch) {
      youtubeVideoId = urlMatch[1];
      continue;
    }
    if (/^https?:\/\//i.test(content)) continue;

    if (!sourceTitle) sourceTitle = content;
  }

  let order = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(TIMESTAMP_LINE);
    if (!match) continue;

    const [, h, m, s, ms, textRaw] = match;
    const text = textRaw.trim();
    if (!text) continue;

    segments.push({
      order,
      timestampLabel: `${h}:${m}:${s}.${ms}`,
      timestampSeconds: timestampToSeconds(h, m, s, ms),
      text,
      isChapter: CHAPTER_LINE.test(text),
    });
    order += 1;
  }

  const durationSeconds =
    segments.length > 0 ? segments[segments.length - 1].timestampSeconds : null;

  return { sourceTitle, youtubeVideoId, segments, durationSeconds };
}
