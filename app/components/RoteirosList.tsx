"use client";

import { useEffect, useState } from "react";

interface Roteiro {
  id: string;
  video_id: string;
  video_title: string;
  video_label: string;
  roteiro: string;
  minutagem: string;
  youtube_video_id: string;
  source_title: string;
  segment_count: number;
  duration_seconds: number;
  created_at: string;
}

interface RoteirosListProps {
  videoId: string;
}

export function RoteirosList({ videoId }: RoteirosListProps) {
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoteiro, setSelectedRoteiro] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoteiros() {
      if (!videoId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/roteiros?video_id=${encodeURIComponent(videoId)}`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Erro ao carregar');
        }

        setRoteiros(result.data || []);
      } catch (error: any) {
        console.error('❌ Erro ao carregar roteiros:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    loadRoteiros();
  }, [videoId]);

  // Função para extrair timestamps do texto
  const extractTimestamps = (text: string) => {
    const lines = text.split('\n');
    const timestampRegex = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+(.*)$/;
    const segments: { time: string; text: string }[] = [];
    
    for (const line of lines) {
      const match = line.trim().match(timestampRegex);
      if (match) {
        segments.push({
          time: match[1].slice(0, 8), // Pega só HH:MM:SS
          text: match[2]
        });
      }
    }
    
    return segments;
  };

  // Remove as linhas de cabeçalho do transcript
  const cleanTranscript = (text: string) => {
    const lines = text.split('\n');
    // Remove linhas que começam com # (cabeçalho)
    const cleaned = lines.filter(line => !line.trim().startsWith('#'));
    return cleaned.join('\n');
  };

  if (loading) {
    return <p className="text-muted">⏳ Carregando roteiros...</p>;
  }

  if (error) {
    return <p className="text-muted" style={{ color: 'var(--rose)' }}>❌ Erro: {error}</p>;
  }

  if (roteiros.length === 0) {
    return (
      <div className="roteiros-empty">
        <p className="text-muted">📭 Nenhum roteiro enviado ainda.</p>
        <p className="text-muted-small">Clique em "Enviar Roteiro" para adicionar o transcript deste vídeo.</p>
      </div>
    );
  }

  return (
    <div className="roteiros-list-container">
      {roteiros.map((roteiro) => {
        const segments = extractTimestamps(roteiro.roteiro);
        const cleanedText = cleanTranscript(roteiro.roteiro);
        const isExpanded = selectedRoteiro === roteiro.id;

        return (
          <div 
            key={roteiro.id} 
            className="roteiro-item"
          >
            <div 
              className="roteiro-item-header"
              onClick={() => setSelectedRoteiro(isExpanded ? null : roteiro.id)}
            >
              <div className="roteiro-item-info">
                <span className="roteiro-item-title">
                  {roteiro.source_title || roteiro.video_title || 'Roteiro'}
                </span>
                <span className="roteiro-item-meta">
                  {segments.length} segmentos · 
                  {roteiro.duration_seconds ? ` ${Math.round(roteiro.duration_seconds / 60)}min` : ''} · 
                  {new Date(roteiro.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <span className="roteiro-item-toggle">
                {isExpanded ? '▲' : '▼'}
              </span>
            </div>
            
            {isExpanded && (
              <div className="roteiro-item-content">
                <div className="roteiro-minutagem">
                  <strong>⏱️ Minutagem:</strong> {roteiro.minutagem || 'Não especificada'}
                </div>
                
                {/* Timestamps clicáveis */}
                {segments.length > 0 && (
                  <div className="roteiro-timestamps">
                    <div className="roteiro-timestamps-grid">
                      {segments.map((seg, idx) => (
                        <div key={idx} className="roteiro-timestamp-item">
                          <span className="roteiro-timestamp-time">{seg.time}</span>
                          <span className="roteiro-timestamp-text">{seg.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
