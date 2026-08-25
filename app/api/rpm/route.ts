import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { video_id, rpm, report_date } = await req.json();

    if (!video_id || rpm === undefined || rpm === null || rpm === "") {
      return NextResponse.json({ error: "video_id e rpm são obrigatórios" }, { status: 400 });
    }

    const rpmNumber = Number(rpm);
    if (Number.isNaN(rpmNumber) || rpmNumber < 0) {
      return NextResponse.json({ error: "rpm inválido" }, { status: 400 });
    }

    const date = report_date || new Date().toISOString().slice(0, 10);
    const supabase = getServiceSupabase();

    const { error } = await supabase
      .from("analytics_manual")
      .upsert(
        { video_id, rpm: rpmNumber, report_date: date },
        { onConflict: "video_id,report_date" }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
