import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

// Salva (ou limpa) o valor real de receita dos últimos 28 dias, digitado
// manualmente a partir do resumo do YouTube Studio. Mandar `amount: null`
// limpa o valor e o site volta a usar a estimativa por RPM.
export async function POST(req: NextRequest) {
  try {
    const { amount } = await req.json();

    let amountValue: number | null = null;
    if (amount !== null && amount !== undefined && amount !== "") {
      amountValue = Number(amount);
      if (Number.isNaN(amountValue) || amountValue < 0) {
        return NextResponse.json({ error: "valor inválido" }, { status: 400 });
      }
    }

    const supabase = getServiceSupabase();

    const { error } = await supabase
      .from("manual_revenue")
      .upsert(
        { id: "current", amount: amountValue, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true, amount: amountValue });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
