"use client";

import { useEffect, useRef, useState } from "react";
import { IconSpeaker, IconPause, IconMic } from "@/app/components/Icons";

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

// Tipagem mínima da Web Speech API (reconhecimento de voz do navegador) —
// não vem nos tipos padrão do TypeScript/DOM.
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = {
  results: { 0: SpeechRecognitionResultLike }[];
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [loadingAudioIndex, setLoadingAudioIndex] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(true);
  // "Modo de voz": ativado ao clicar no microfone. O modal fecha, mas o
  // ciclo ouvir -> enviar -> IA responde -> tocar áudio -> ouvir de novo
  // continua rodando em segundo plano até o usuário cancelar.
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const spokenIndexRef = useRef<number | null>(null);
  // Marca se o reconhecimento atual chegou a captar alguma fala, para saber
  // se deve reiniciar a escuta sozinho (silêncio) no modo de voz.
  const resultReceivedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Configura o reconhecimento de voz do navegador (Chrome/Edge) uma única
  // vez. Se o navegador não suportar, escondemos o botão de microfone.
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setMicSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (e: SpeechRecognitionEventLike) => {
      const transcript = e.results[0][0].transcript;
      resultReceivedRef.current = true;
      if (voiceModeRef.current) {
        // Modo de voz: envia direto, sem passar pela caixa de texto.
        sendMessage(transcript);
      } else {
        setInput(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      // Erro comum é "no-speech" (silêncio). No modo de voz, tenta ouvir
      // de novo em vez de simplesmente desistir.
      if (voiceModeRef.current && !resultReceivedRef.current) restartListening();
    };
    recognition.onend = () => {
      setListening(false);
      if (voiceModeRef.current && !resultReceivedRef.current) restartListening();
    };

    recognitionRef.current = recognition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reinicia a escuta depois de um pequeno intervalo — usado tanto após
  // silêncio quanto após a IA terminar de falar, para manter a conversa
  // por voz fluindo sozinha.
  function restartListening(delay = 350) {
    setTimeout(() => {
      if (!voiceModeRef.current || !recognitionRef.current) return;
      try {
        resultReceivedRef.current = false;
        setListening(true);
        recognitionRef.current.start();
      } catch {
        // Reconhecimento já pode estar ativo; ignora.
      }
    }, delay);
  }

  // Clicar no microfone do painel: fecha o modal e entra no modo de voz
  // contínuo, rodando em segundo plano.
  function startVoiceMode() {
    if (!recognitionRef.current) return;
    voiceModeRef.current = true;
    setVoiceMode(true);
    setOpen(false);
    audioRef.current?.pause();
    setSpeakingIndex(null);
    setAudioError(null);
    resultReceivedRef.current = false;
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      // já rodando
    }
  }

  // Cancela o modo de voz por completo (botão vira "×" enquanto ativo).
  function stopVoiceMode() {
    voiceModeRef.current = false;
    setVoiceMode(false);
    recognitionRef.current?.stop();
    audioRef.current?.pause();
    setListening(false);
    setSpeakingIndex(null);
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    if (overrideText === undefined) setInput("");
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

  async function toggleSpeak(index: number, text: string) {
    // Clicou de novo na mesma mensagem que já está tocando -> para o áudio.
    if (speakingIndex === index) {
      audioRef.current?.pause();
      setSpeakingIndex(null);
      return;
    }

    audioRef.current?.pause();
    setLoadingAudioIndex(index);
    setAudioError(null);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const errText = await res.text();
        // Antes isso ficava mudo no modo automático/voz — agora sempre
        // mostra o motivo real (chave ausente, limite atingido etc.) em
        // vez de fingir que tocou o áudio.
        setAudioError(errText || "Não consegui gerar o áudio.");
        if (voiceModeRef.current) restartListening();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeakingIndex(null);
        if (voiceModeRef.current) restartListening();
      };
      audio.onerror = () => {
        setSpeakingIndex(null);
        setAudioError("O navegador não conseguiu tocar o áudio gerado.");
        if (voiceModeRef.current) restartListening();
      };

      await audio.play();
      setSpeakingIndex(index);
      setAudioError(null);
    } catch (err) {
      // Autoplay bloqueado pelo navegador cai aqui também (NotAllowedError)
      // — mostra isso em vez de fingir que funcionou.
      const message = err instanceof Error ? err.message : "";
      setAudioError(
        message.toLowerCase().includes("play") || message.toLowerCase().includes("allow")
          ? "O navegador bloqueou o áudio automático. Toque na tela e tente de novo."
          : "Não consegui gerar o áudio agora. Confere o GOOGLE_TTS_API_KEY e tenta de novo."
      );
      if (voiceModeRef.current) restartListening();
    } finally {
      setLoadingAudioIndex(null);
    }
  }

  // Assim que uma resposta da IA termina de chegar (parou de "streamar"),
  // toca o áudio dela automaticamente — sem precisar clicar em "ouvir".
  useEffect(() => {
    if (loading || messages.length === 0) return;
    const lastIndex = messages.length - 1;
    const last = messages[lastIndex];
    if (last.role !== "assistant" || !last.content) return;
    if (spokenIndexRef.current === lastIndex) return;

    spokenIndexRef.current = lastIndex;
    toggleSpeak(lastIndex, last.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages]);

  return (
    <>
      {!open && voiceMode && (
        <div className="ai-chat-voice-indicator">
          {audioError && <div className="ai-chat-voice-error">{audioError}</div>}
          <span className="ai-chat-voice-status">
            {listening ? "ouvindo…" : loading ? "pensando…" : speakingIndex !== null ? "falando…" : "no ar…"}
          </span>
          <button
            className={`ai-chat-fab ai-chat-fab-voice ai-chat-fab-voice-${
              listening ? "listening" : loading ? "thinking" : speakingIndex !== null ? "speaking" : "idle"
            }`}
            onClick={stopVoiceMode}
            aria-label="Cancelar chat de voz e desligar o microfone"
            title="Cancelar chat de voz"
          >
            ×
          </button>
        </div>
      )}

      {!open && !voiceMode && (
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="ai-chat-close" onClick={() => setOpen(false)} aria-label="Fechar">
              ×
            </button>
          </div>
        </div>

        <div className="ai-chat-messages" ref={scrollRef}>
          {audioError && <div className="ai-chat-audio-error">🔇 {audioError}</div>}
          {messages.length === 0 && (
            <div className="ai-chat-empty">Olá <strong>Criador</strong>! Pergunte sobre views, receita e projeções do canal.</div>
          )}
          {messages.map((m, i) => {
            const isStreamingThis = loading && i === messages.length - 1;
            const canSpeak = m.role === "assistant" && !!m.content && !isStreamingThis;
            return (
              <div key={i} className={`ai-chat-bubble ai-chat-bubble-${m.role}`}>
                <div>{m.content ? renderRichText(m.content) : isStreamingThis ? "…" : ""}</div>
                {canSpeak && (
                  <button
                    className={`ai-chat-speak-btn icon-label ${speakingIndex === i ? "ai-chat-speak-btn-active" : ""}`}
                    onClick={() => toggleSpeak(i, m.content)}
                    disabled={loadingAudioIndex === i}
                    aria-label={speakingIndex === i ? "Parar áudio" : "Ouvir resposta"}
                  >
                    {loadingAudioIndex === i ? (
                      "carregando…"
                    ) : speakingIndex === i ? (
                      <>
                        <IconPause /> parar
                      </>
                    ) : (
                      <>
                        <IconSpeaker /> ouvir
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="ai-chat-input-row">
          {micSupported && (
            <button
              type="button"
              className="ai-chat-mic-btn"
              onClick={startVoiceMode}
              aria-label="Falar com a IA por voz (fecha o chat e continua em segundo plano)"
              title="Falar por voz — o chat fecha e continua ouvindo em segundo plano"
            >
              <IconMic size={16} />
            </button>
          )}
          <textarea
            className="ai-chat-input"
            placeholder={listening ? "Ouvindo…" : "Escreva ou fale sua pergunta…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button className="ai-chat-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
            Enviar
          </button>
        </div>
      </div>

      {open && <div className="ai-chat-backdrop" onClick={() => setOpen(false)} />}
    </>
  );
}
