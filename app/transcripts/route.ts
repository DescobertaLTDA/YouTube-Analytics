import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { parseTactiqTranscript } from "@/lib/transcript-parser";

export async function POST(req: NextRequest) {
  try {
    const { raw_text, video_id } = await req.json();

    if (!raw_text || typeof raw_text !== "string" || !raw_text.trim()) {
      return NextResponse.json({ error: "raw_text é obrigatório" }, { status: 400 });
    }

    const parsed = parseTactiqTranscript(raw_text);

    if (parsed.segments.length === 0) {
      return NextResponse.json(
        { error: "Não encontrei nenhuma linha no formato 'HH:MM:SS.mmm texto' no transcript colado." },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    const { data: transcript, error: transcriptError } = await supabase
      .from("transcripts")
      .insert({
        video_id: video_id || null,
        youtube_video_id: parsed.youtubeVideoId,
        source_title: parsed.sourceTitle,
        raw_text,
        segment_count: parsed.segments.length,
        duration_seconds: parsed.durationSeconds,
      })
      .select()
      .single();

    if (transcriptError) throw transcriptError;

    const segmentRows = parsed.segments.map((seg) => ({
      transcript_id: transcript.id,
      segment_order: seg.order,
      timestamp_label: seg.timestampLabel,
      timestamp_seconds: seg.timestampSeconds,
      text: seg.text,
      is_chapter: seg.isChapter,
    }));

    const { error: segmentsError } = await supabase.from("transcript_segments").insert(segmentRows);

    if (segmentsError) throw segmentsError;

    return NextResponse.json({
      ok: true,
      transcript_id: transcript.id,
      segment_count: parsed.segments.length,
      chapter_count: parsed.segments.filter((s) => s.isChapter).length,
      duration_seconds: parsed.durationSeconds,
      youtube_video_id: parsed.youtubeVideoId,
      source_title: parsed.sourceTitle,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
