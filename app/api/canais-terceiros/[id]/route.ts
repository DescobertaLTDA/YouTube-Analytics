import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// DELETE /api/canais-terceiros/:id
//
// Soft-delete (active=false) em vez de apagar a linha — mantém o
// histórico de quando cada canal foi adicionado, caso a pessoa queira
// readicionar depois (o POST em /api/canais-terceiros reativa em vez
// de duplicar).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getServiceSupabase();
    const { error } = await db.from("tracked_channels").update({ active: false }).eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
