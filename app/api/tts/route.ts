import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voz padrão da ElevenLabs (multilíngue, funciona bem em PT-BR com o
// modelo eleven_multilingual_v2). Dá pra trocar sem mexer no código
// cadastrando ELEVENLABS_VOICE_ID nas env vars do projeto.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

// Recebe o texto de uma resposta da IA e devolve o áudio (mp3) gerado pela
// ElevenLabs, pra tocar direto no navegador.
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API;
    if (!apiKey) {
      return new Response("ELEVENLABS_API não configurada no projeto.", { status: 500 });
    }

    const { text } = (await req.json()) as { text: string };
    if (!text || !text.trim()) {
      return new Response("Nenhum texto enviado.", { status: 400 });
    }

    // A ElevenLabs não lida bem com marcações markdown (fala os asteriscos
    // em voz alta) — tira o negrito **texto** antes de mandar pra fala.
    const cleanText = text.replace(/\*\*(.+?)\*\*/g, "$1").trim();

    const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!elevenResponse.ok || !elevenResponse.body) {
      const errText = await elevenResponse.text().catch(() => "");
      console.error("❌ Erro na API da ElevenLabs:", elevenResponse.status, errText);

      // Sem crédito/saldo na conta ElevenLabs.
      if (elevenResponse.status === 402) {
        return new Response("Sua conta do ElevenLabs está sem saldo. Adicione créditos ou faça upgrade do plano em elevenlabs.io.", { status: 502 });
      }

      // Chave inválida ou sem permissão.
      if (elevenResponse.status === 401) {
        return new Response("Chave da ElevenLabs inválida. Confere o ELEVENLABS_API nas env vars do Vercel.", { status: 502 });
      }

      return new Response("Erro ao gerar áudio. Tente de novo em instantes.", { status: 502 });
    }

    return new Response(elevenResponse.body, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("❌ Erro na rota /api/tts:", message);
    return new Response("Erro interno ao gerar áudio.", { status: 500 });
  }
}
