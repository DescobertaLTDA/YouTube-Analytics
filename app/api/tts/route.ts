import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voz padrão do Google Cloud TTS em PT-BR: masculina, tecnologia Neural2
// (a mais natural disponível em pt-BR). Dá pra trocar sem mexer no código
// cadastrando GOOGLE_TTS_VOICE nas env vars do projeto — outras opções
// masculinas: "pt-BR-Wavenet-B", "pt-BR-Wavenet-C".
const DEFAULT_VOICE = "pt-BR-Neural2-B";

// Recebe o texto de uma resposta da IA e devolve o áudio (mp3) gerado pelo
// Google Cloud Text-to-Speech, pra tocar direto no navegador.
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      return new Response("GOOGLE_TTS_API_KEY não configurada no projeto.", { status: 500 });
    }

    const { text } = (await req.json()) as { text: string };
    if (!text || !text.trim()) {
      return new Response("Nenhum texto enviado.", { status: 400 });
    }

    // O Google também fala os asteriscos em voz alta se não tirarmos as
    // marcações markdown antes de mandar pra síntese.
    const cleanText = text.replace(/\*\*(.+?)\*\*/g, "$1").trim();

    const voiceName = process.env.GOOGLE_TTS_VOICE || DEFAULT_VOICE;

    const googleResponse = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: cleanText },
          voice: { languageCode: "pt-BR", name: voiceName },
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );

    if (!googleResponse.ok) {
      const errText = await googleResponse.text().catch(() => "");
      console.error("❌ Erro na API do Google TTS:", googleResponse.status, errText);

      if (googleResponse.status === 403) {
        return new Response("Chave do Google TTS inválida ou API não ativada. Confere o GOOGLE_TTS_API_KEY e se a API 'Cloud Text-to-Speech' está ativa no projeto do Google Cloud.", { status: 502 });
      }

      if (googleResponse.status === 429) {
        return new Response("Limite gratuito do Google TTS atingido por agora. Tente de novo em instantes.", { status: 502 });
      }

      return new Response("Erro ao gerar áudio. Tente de novo em instantes.", { status: 502 });
    }

    const data = (await googleResponse.json()) as { audioContent?: string };
    if (!data.audioContent) {
      console.error("❌ Google TTS não retornou audioContent:", data);
      return new Response("Erro ao gerar áudio. Tente de novo em instantes.", { status: 502 });
    }

    // O Google devolve o áudio em base64 dentro do JSON — decodifica pra
    // bytes puros de mp3 antes de devolver pro navegador.
    const audioBuffer = Buffer.from(data.audioContent, "base64");

    return new Response(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("❌ Erro na rota /api/tts:", message);
    return new Response("Erro interno ao gerar áudio.", { status: 500 });
  }
}
