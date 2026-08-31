import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { parseRpmCsv } from "@/lib/rpm-csv-parser";

export const dynamic = "force-dynamic";

// Recebe o "Dados da tabela.csv" exportado do YouTube Studio (multipart
// form-data, campo "file"), extrai o RPM real por vídeo (lib/rpm-csv-parser)
// e faz upsert em `video_rpm_real` (ver migração 0004). Chamado pelo botão
// "Carregar CSV" da aba Ganhos (Parte 4 do plano).
//
// report_start / report_end são opcionais (form fields de texto,
// formato YYYY-MM-DD) — só pra guardar de qual período aquele RPM veio,
// não afetam o upsert (que é sempre "o RPM mais recente conhecido do
// vídeo").
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const reportStart = formData.get("report_start");
    const reportEnd = formData.get("report_end");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Envie o arquivo CSV no campo 'file' (multipart/form-data)." },
        { status: 400 }
      );
    }

    const csvText = await file.text();

    let parsed;
    try {
      parsed = parseRpmCsv(csvText);
    } catch (parseErr: unknown) {
      const message = parseErr instanceof Error ? parseErr.message : "erro ao ler CSV";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "Nenhum vídeo com RPM válido encontrado nesse CSV." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const upsertRows = parsed.rows.map((row) => ({
      youtube_video_id: row.youtube_video_id,
      rpm: row.rpm,
      receita: row.receita,
      views: row.views,
      report_start: typeof reportStart === "string" && reportStart ? reportStart : null,
      report_end: typeof reportEnd === "string" && reportEnd ? reportEnd : null,
      updated_at: now,
    }));

    const supabase = getServiceSupabase();

    // Upsert em lotes de 500 pra não estourar o payload em canais com
    // muitos vídeos.
    const BATCH_SIZE = 500;
    for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
      const batch = upsertRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("video_rpm_real")
        .upsert(batch, { onConflict: "youtube_video_id" });

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      imported: parsed.rows.length,
      skipped: parsed.skipped,
      total_row: parsed.totalRow,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
