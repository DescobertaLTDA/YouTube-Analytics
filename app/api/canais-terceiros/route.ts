import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, type TrackedChannelRow } from "@/lib/supabase";
import { resolveChannelId } from "@/lib/youtube-channel";

export const dynamic = "force-dynamic";

// GET /api/canais-terceiros
//
// Lista os canais de terceiros ativos (adicionados via POST abaixo),
// mais recente primeiro.
export async function GET() {
  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("tracked_channels")
      .select("*")
      .eq("active", true)
      .order("added_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { channels: (data as TrackedChannelRow[]) || [] },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/canais-terceiros
// body: { input: string }
//
// `input` pode ser uma URL do canal (/channel/UC..., /@handle, /c/Nome,
// /user/Nome), um @handle solto, um ID de canal (UC...) direto, ou só o
// nome do canal digitado — resolveChannelId (lib/youtube-channel.ts)
// tenta os caminhos baratos em cota primeiro e só cai pra busca por
// nome como último recurso.
//
// Upsert por youtube_channel_id: se o canal já tinha sido removido
// (active=false) antes, adicionar de novo só reativa a linha em vez de
// duplicar — mantém `added_at` original nesse caso.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = typeof body?.input === "string" ? body.input.trim() : "";
    if (!input) {
      return NextResponse.json({ error: "Informe uma URL, @handle ou nome de canal." }, { status: 400 });
    }

    const resolved = await resolveChannelId(input);
    if (!resolved) {
      return NextResponse.json(
        { error: "Não achei nenhum canal do YouTube com esse dado. Tenta colar a URL completa do canal." },
        { status: 404 }
      );
    }

    const db = getServiceSupabase();
    const { data, error } = await db
      .from("tracked_channels")
      .upsert(
        {
          youtube_channel_id: resolved.channelId,
          channel_title: resolved.title,
          avatar_url: resolved.avatarUrl,
          active: true,
        },
        { onConflict: "youtube_channel_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ channel: data as TrackedChannelRow });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
