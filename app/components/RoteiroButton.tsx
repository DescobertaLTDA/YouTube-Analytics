"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
      // Extrai o título do vídeo do transcript (linha com #)
      const titleMatch = roteiro.match(/^#\s*(.+)$/m);
      const extractedTitle = titleMatch ? titleMatch[1] : null;

      // Extrai o ID do YouTube se presente
      const youtubeIdMatch = roteiro.match(/watch\/([a-zA-Z0-9_-]{6,})/);
      const youtubeId = youtubeIdMatch ? youtubeIdMatch[1] : null;

      // Conta quantas linhas com timestamp
      const timestampLines = roteiro.match(/^\d{2}:\d{2}:\d{2}\.\d{3}/gm);
      const segmentCount = timestampLines ? timestampLines.length : 0;

      // Calcula duração aproximada (último timestamp)
      const lastTimestamp = roteiro.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*[^-]*$/m);
      let durationSeconds = null;
      if (lastTimestamp) {
        const parts = lastTimestamp[1].split(':');
        durationSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
      }

      const { error } = await supabase
        .from('roteiros')
        .insert({
          video_id: videoId,
          video_title: videoTitle,
          video_label: videoLabel,
          roteiro: roteiro.trim(),
          minutagem: extractedTitle || 'Transcript completo',
          youtube_video_id: youtubeId,
          segment_count: segmentCount,
          duration_seconds: durationSeconds,
          source_title: extractedTitle
        });

      if (error) throw error;

      setMessage({ 
        type: 'success', 
        text: `✅ Roteiro enviado! ${segmentCount} linhas de minutagem extraídas.` 
      });
      setRoteiro('');
      
      setTimeout(() => {
        setShowModal(false);
        setMessage(null);
      }, 3000);
    } catch (error) {
      console.error('Erro ao salvar roteiro:', error);
      setMessage({ type: 'error', text: 'Erro ao enviar roteiro. Tente novamente.' });
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
                />
                <div style={{ 
                  fontSize: '12px', 
                  color: 'var(--text-muted)', 
                  marginTop: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '4px'
                }}>
                  <span>📌 O sistema extrai automaticamente os timestamps e capítulos</span>
                  <span>{roteiro.length}/100000</span>
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
