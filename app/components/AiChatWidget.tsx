"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

// Renderiza só o essencial do markdown que a IA costuma usar (negrito com
// **texto**) como JSX de verdade, sem precisar de nenhuma lib de markdown
// nem dangerouslySetInnerHTML.
function renderRichText(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.body) throw new Error("sem resposta");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: errText || "Deu erro por aqui. Tenta de novo." };
          return copy;
        });
        setLoading(false);
        return;
      }

      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const finalText = acc;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: finalText };
          return copy;
        });
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: "Não consegui falar com a IA agora. Confere se a ANTHROPIC_API_KEY está certa e tenta de novo.",
        };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {!open && (
        <button className="ai-chat-fab" onClick={() => setOpen(true)} aria-label="Abrir chat com a IA">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      )}

      <div className={`ai-chat-panel ${open ? "ai-chat-panel-open" : ""}`}>
        <div className="ai-chat-header">
          <div>
            <div className="ai-chat-title">Assistente do dashboard</div>
            <div className="ai-chat-subtitle">Pergunte sobre views, receita e projeções</div>
          </div>
          <button className="ai-chat-close" onClick={() => setOpen(false)} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="ai-chat-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="ai-chat-empty">
              Ex: &quot;quanto de receita o Lucas pode fazer até o fim do mês?&quot; — a IA calcula com base
              nos dados reais do dashboard.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`ai-chat-bubble ai-chat-bubble-${m.role}`}>
              {m.content ? renderRichText(m.content) : loading && i === messages.length - 1 ? "…" : ""}
            </div>
          ))}
        </div>

        <div className="ai-chat-input-row">
          <textarea
            className="ai-chat-input"
            placeholder="Escreva sua pergunta…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button className="ai-chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>
            Enviar
          </button>
        </div>
      </div>

      {open && <div className="ai-chat-backdrop" onClick={() => setOpen(false)} />}
    </>
  );
}
