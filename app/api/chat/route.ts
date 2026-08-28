import { NextRequest } from "next/server";
import { buildBusinessContext } from "@/lib/ai-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Conversa de verdade com a IA (sem respostas prontas): a cada mensagem,
// remonta o contexto de negócio (dados reais do Supabase, atualizados na
// hora) e manda pra API da Anthropic junto com o histórico da conversa. É
// a própria IA quem faz as contas/projeções em cima dos números — a gente
// só fornece os dados crus no system prompt.
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response("ANTHROPIC_API_KEY não configurada no projeto.", { status: 500 });
    }

    const { messages } = (await req.json()) as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Nenhuma mensagem enviada.", { status: 400 });
    }

    const businessContext = await buildBusinessContext();

    const systemPrompt = `Você é o assistente de dados do dashboard de analytics do canal de YouTube de pedras e minerais do Lucas. Ele te chama pelo ícone de chat no canto do site pra tirar dúvidas sobre os números do negócio (views, receita, criadores, projeções etc).

Responda em português do Brasil, direto e sem enrolação. Use os dados abaixo — que são reais e foram atualizados agora mesmo — para fazer os cálculos, estimativas e projeções necessárias durante a conversa. Mostre o raciocínio quando fizer uma conta (ex: "com base na média diária de X, faltam Y dias, então..."). Nunca invente números que não constam nos dados abaixo; se faltar algo pra responder com precisão, diga isso claramente e dê a melhor estimativa possível com o que você tem.

Você não sabe quem está te chamando no chat — pode ser o Lucas, o Matheus, o Rafael, o editor, ou qualquer outra pessoa da equipe. Não presuma que é o Lucas nem chame ninguém pelo nome de cara: trate a pessoa como "Criador" até que ela mesma diga o nome dela na conversa. A partir do momento que ela se identificar, passe a chamá-la pelo nome dela.

DADOS ATUAIS DO DASHBOARD:

${businessContext}`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    if (!anthropicResponse.ok || !anthropicResponse.body) {
      const errText = await anthropicResponse.text().catch(() => "");
      console.error("❌ Erro na API da Anthropic:", anthropicResponse.status, errText);
      return new Response("Erro ao falar com a IA. Tente de novo em instantes.", { status: 502 });
    }

    // A Anthropic manda Server-Sent Events (várias linhas "event:"/"data:").
    // A gente só repassa pro cliente o texto puro de cada delta, pra não
    // precisar de nenhuma lib de parsing SSE no front.
    const reader = anthropicResponse.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;

              try {
                const event = JSON.parse(jsonStr);
                if (
                  event.type === "content_block_delta" &&
                  event.delta?.type === "text_delta" &&
                  typeof event.delta.text === "string"
                ) {
                  controller.enqueue(encoder.encode(event.delta.text));
                }
              } catch {
                // linha incompleta ou evento que não nos interessa — ignora
              }
            }
          }
        } catch (err) {
          console.error("❌ Erro lendo stream da Anthropic:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("❌ Erro na rota /api/chat:", message);
    return new Response("Erro interno ao processar o chat.", { status: 500 });
  }
}
