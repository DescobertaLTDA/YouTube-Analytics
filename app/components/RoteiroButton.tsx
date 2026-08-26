"use client";

import { useState } from "react";

interface RoteiroButtonProps {
  videoId: string;
  videoTitle: string;
  videoLabel: string;
}

export function RoteiroButton({ videoId, videoTitle, videoLabel }: RoteiroButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [roteiro, setRoteiro] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roteiro.trim()) {
      setMessage({ type: 'error', text: 'Cole o roteiro do vídeo!' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      // Extrai informações do transcript
      const lines = roteiro.split('\n');
      let sourceTitle = null;
      let youtubeVideoId = null;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          const content = trimmed.replace(/^#\s*/, '').trim();
          if (content.includes('youtube.com') || content.includes('youtu.be')) {
            const match = content.match(/(?:watch\?v=|watch\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
            if (match) youtubeVideoId = match[1];
          } else if (!content.includes('tactiq.io') && !content.includes('http')) {
            sourceTitle = content;
          }
        }
      }

      // Conta segmentos com timestamp
      const timestampRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}/;
      const timestampLines = lines.filter(line => timestampRegex.test(line.trim()));
      const segmentCount = timestampLines.length;

      // Calcula duração
      let durationSeconds = 0;
      if (timestampLines.length > 0) {
        const lastLine = timestampLines[timestampLines.length - 1];
        const match = lastLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (match) {
          const [_, h, m, s, ms] = match;
          durationSeconds = parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
        }
      }

      // Dados para enviar
      const dados = {
        video_id: videoId,
        video_title: videoTitle || sourceTitle || 'Sem título',
        video_label: videoLabel || 'Vídeo',
        roteiro: roteiro.trim(),
        minutagem: sourceTitle || 'Transcript completo',
        youtube_video_id: youtubeVideoId,
        source_title: sourceTitle,
        segment_count: segmentCount,
        duration_seconds: Math.round(durationSeconds)
      };

      console.log('📤 Enviando dados:', dados);

      // Envia via API
      const response = await fetch('/api/roteiros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao salvar');
      }

      console.log('✅ Resposta da API:', result);

      setMessage({ 
        type: 'success', 
        text: `✅ Roteiro enviado! ${segmentCount} segmentos extraídos.` 
      });
      setRoteiro('');
      
      setTimeout(() => {
        setShowModal(false);
        setMessage(null);
      }, 2000);
    } catch (error: any) {
      console.error('❌ Erro ao salvar roteiro:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.message || 'Tente novamente.'}` 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button 
        className="btn-roteiro"
        onClick={() => setShowModal(true)}
      >
        📝 Enviar Roteiro
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📝 Enviar Roteiro</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-video-info">
                <span className="modal-video-label">{videoLabel}</span>
                <p className="modal-video-title">{videoTitle}</p>
              </div>

              <div className="form-group">
                <label htmlFor="roteiro">
                  📄 Cole o transcript completo (formato tactiq.io)
                </label>
                <textarea
                  id="roteiro"
                  value={roteiro}
                  onChange={(e) => setRoteiro(e.target.value)}
                  placeholder={`Cole aqui o transcript exportado do tactiq.io ou qualquer texto com timestamps no formato:\n\n# Título do vídeo\n# https://www.youtube.com/watch/ID\n\n00:00:00.160 Texto do primeiro segmento\n00:00:03.000 Texto do segundo segmento`}
                  required
                  style={{ minHeight: '200px' }}
                />
                <div style={{ 
                  fontSize: '12px', 
                  color: 'var(--text-muted)', 
                  marginTop: '6px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>📌 O sistema extrai automaticamente os timestamps</span>
                  <span>{roteiro.length} caracteres</span>
                </div>
              </div>

              {message && (
                <div className={`modal-message ${message.type}`}>
                  {message.text}
                </div>
              )}

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn btn-outline"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-success"
                  disabled={saving}
                >
                  {saving ? 'Enviando...' : '💾 Salvar Roteiro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
