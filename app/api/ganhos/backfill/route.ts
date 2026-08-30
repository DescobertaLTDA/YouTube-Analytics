import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getDailyVideoRevenue } from "@/lib/youtube-revenue";

export const dynamic = "force-dynamic";

// Rota de USO ÚNICO: preenche retroativamente `creator_video_view_history`
// com views por vídeo/dia vindas da YouTube Analytics API (mesma chamada
// que já usamos pra receita oficial — ela devolve `views` de brinde).
//
// Motivo de existir: o histórico diário só começou a ser gravado a partir
// do dia em que o sync (cron `/api/ganhos/sync`) passou a rodar. Dias
// anteriores a isso ficam sem view_count por vídeo, então o gráfico
// "Receita ao longo do tempo" não tem o que mostrar pra trás.
//
// O que essa rota NÃO faz:
// - Não sobrescreve dias que JÁ existem em creator_video_view_history
//   (upsert com `ignoreDuplicates: true` — o cron diário sempre tem
//   prioridade, porque ele grava o view_count exato daquele dia; a
//   Analytics API é só pra tapar os buracos de antes).
// - Não inventa nada pros ~2 dias mais recentes que a Analytics API ainda
//   não processou — eles simplesmente não vêm na resposta e continuam
//   sem view_count aqui. Isso é esperado: o app já cai sozinho pra
//   estimativa por RPM (ver getCreatorDailyEarnings) sempre que não há
//   view_count real pra calcular o delta daquele dia.
//
// Uso: GET /api/ganhos/backfill?days=35 (query opcional, default 35).
// Rode uma vez, confira o resultado, e pode apagar esse arquivo depois.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") || "35");

    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const rows = await getDailyVideoRevenue(startDate, endDate);

    if (rows === null) {
      return NextResponse.json(
        {
          success: false,
          message:
            "OAuth da YouTube Analytics API não configurado ou falhou. Confira YOUTUBE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN.",
        },
        { status: 200 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: true, message: "A API não retornou nenhuma linha pro período pedido.", inserted: 0 },
        { status: 200 }
      );
    }

    const db = getServiceSupabase();

    // Pra saber is_short e published_at de cada vídeo (a Analytics API não
    // devolve isso, só o ID). creator_videos já tem essa info salva pra
    // todo vídeo com hashtag; vídeo sem hashtag fica sem esses dois campos
    // preenchidos (não afeta o cálculo de receita, só a classificação).
    const { data: creatorVideos } = await db
      .from("creator_videos")
      .select("youtube_video_id, is_short, published_at");

    const videoMeta = new Map<string, { isShort: boolean; publishedAt: string | null }>();
    for (const v of (creatorVideos as { youtube_video_id: string; is_short: boolean; published_at: string | null }[]) || []) {
      videoMeta.set(v.youtube_video_id, { isShort: v.is_short, publishedAt: v.published_at });
    }

    const historyRows = rows.map((row) => {
      const meta = videoMeta.get(row.videoId);
      return {
        youtube_video_id: row.videoId,
        view_count: row.views,
        is_short: meta?.isShort ?? false,
        published_at: meta?.publishedAt ?? null,
        captured_at: `${row.date}T12:00:00Z`,
        captured_date: row.date,
      };
    });

    // ignoreDuplicates: true garante que um dia já gravado pelo cron
    // diário (com o view_count exato daquele momento) nunca é sobrescrito
    // por esse backfill retroativo.
    const { error, count } = await db
      .from("creator_video_view_history")
      .upsert(historyRows, {
        onConflict: "youtube_video_id,captured_date",
        ignoreDuplicates: true,
        count: "exact",
      });

    if (error) throw error;

    const uniqueDates = Array.from(new Set(rows.map((r) => r.date))).sort();

    return NextResponse.json({
      success: true,
      periodoConsultado: { startDate, endDate },
      diasRetornadosPelaApi: uniqueDates,
      linhasRecebidasDaApi: rows.length,
      linhasNovasInseridas: count ?? historyRows.length,
      obs:
        "Dias recentes que não aparecem em 'diasRetornadosPelaApi' ainda não foram processados pela Analytics API (~1-2 dias de atraso). Eles serão preenchidos automaticamente pelo sync diário normal.",
    });
  } catch (error) {
    console.error("❌ Erro no backfill de creator_video_view_history:", error);
    return NextResponse.json(
      { success: false, message: "Erro no backfill.", error: String(error) },
      { status: 500 }
    );
  }
}
