"use client";

import { useEffect, useState } from "react";
import { IconInbox, IconCalendar } from "@/app/components/Icons";

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
        console.log('🔍 Buscando roteiros para:', videoId);
        
        const response = await fetch(`/api/roteiros?video_id=${encodeURIComponent(videoId)}`);
        
        // Verifica se a resposta é ok
        if (!response.ok) {
          const text = await response.text();
          console.error('❌ Resposta não OK:', text);
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        // Tenta fazer o parse do JSON
        let result;
        try {
          result = await response.json();
        } catch (parseError) {
          console.error('❌ Erro ao parsear JSON:', parseError);
          throw new Error('Resposta inválida do servidor');
        }

        console.log('✅ Roteiros via API:', result);
        setRoteiros(result.data || []);
      } catch (error: any) {
        console.error('❌ Erro ao carregar roteiros:', error);
        setError(error.message || 'Erro ao carregar roteiros');
      } finally {
        setLoading(false);
      }
    }

    loadRoteiros();
  }, [videoId]);

  if (loading) {
    return <p className="text-muted">Carregando roteiros...</p>;
  }

  if (error) {
    return (
      <div className="roteiros-empty">
        <p className="text-muted" style={{ color: 'var(--rose)' }}>Erro: {error}</p>
        <p className="text-muted-small">Tente recarregar a página ou enviar o roteiro novamente.</p>
      </div>
    );
  }

  if (roteiros.length === 0) {
    return (
      <div className="roteiros-empty">
        <p className="text-muted icon-label"><IconInbox /> Nenhum roteiro enviado ainda.</p>
        <p className="text-muted-small">Clique em "Enviar Roteiro" para adicionar o transcript deste vídeo.</p>
      </div>
    );
  }

  return (
    <div className="roteiros-list-container">
      {roteiros.map((roteiro) => (
        <div 
          key={roteiro.id} 
          className="roteiro-item"
        >
          <div 
            className="roteiro-item-header"
            onClick={() => setSelectedRoteiro(selectedRoteiro === roteiro.id ? null : roteiro.id)}
          >
            <div className="roteiro-item-info">
              <span className="roteiro-item-title">
                {roteiro.source_title || roteiro.video_title || 'Roteiro'}
              </span>
              <span className="roteiro-item-meta">
                {roteiro.segment_count || 0} segmentos · 
                {roteiro.duration_seconds ? ` ${Math.round(roteiro.duration_seconds / 60)}min` : ''} · 
                {new Date(roteiro.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <span className="roteiro-item-toggle">
              {selectedRoteiro === roteiro.id ? '▲' : '▼'}
            </span>
          </div>
          
          {selectedRoteiro === roteiro.id && (
            <div className="roteiro-item-content">
              <div className="roteiro-minutagem icon-label">
                <IconCalendar /> <strong>Minutagem:</strong> {roteiro.minutagem || 'Não especificada'}
              </div>
              <div className="roteiro-texto">
                <pre>{roteiro.roteiro}</pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
