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
  const [minutagem, setMinutagem] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roteiro.trim() || !minutagem.trim()) {
      setMessage({ type: 'error', text: 'Preencha todos os campos!' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('roteiros')
        .insert({
          video_id: videoId,
          video_title: videoTitle,
          video_label: videoLabel,
          roteiro: roteiro.trim(),
          minutagem: minutagem.trim()
        });

      if (error) throw error;

      setMessage({ type: 'success', text: '✅ Roteiro enviado com sucesso!' });
      setRoteiro('');
      setMinutagem('');
      
      setTimeout(() => {
        setShowModal(false);
        setMessage(null);
      }, 2000);
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
                <label htmlFor="minutagem">
                  ⏱️ Minutagem (ex: 00:00 - 05:30)
                </label>
                <input
                  type="text"
                  id="minutagem"
                  value={minutagem}
                  onChange={(e) => setMinutagem(e.target.value)}
                  placeholder="Ex: 00:00 - 05:30 ou Capítulo 1: Introdução"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="roteiro">
                  📄 Roteiro do Vídeo
                </label>
                <textarea
                  id="roteiro"
                  value={roteiro}
                  onChange={(e) => setRoteiro(e.target.value)}
                  placeholder="Cole o roteiro completo do vídeo aqui..."
                  required
                />
                <div className="roteiro-counter">
                  <span>{roteiro.length}/10000</span>
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
