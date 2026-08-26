"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  const [selectedRoteiro, setSelectedRoteiro] = useState<Roteiro | null>(null);

  useEffect(() => {
    async function loadRoteiros() {
      try {
        const { data, error } = await supabase
          .from('roteiros')
          .select('*')
          .eq('video_id', videoId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setRoteiros(data || []);
      } catch (error) {
        console.error('Erro ao carregar roteiros:', error);
      } finally {
        setLoading(false);
      }
    }

    if (videoId) {
      loadRoteiros();
    }
  }, [videoId]);

  if (loading) {
    return <p className="text-muted">Carregando roteiros...</p>;
  }

  if (roteiros.length === 0) {
    return (
      <div className="roteiros-empty">
        <p className="text-muted">Nenhum roteiro enviado ainda.</p>
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
          onClick={() => setSelectedRoteiro(selectedRoteiro?.id === roteiro.id ? null : roteiro)}
        >
          <div className="roteiro-item-header">
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
              {selectedRoteiro?.id === roteiro.id ? '▲' : '▼'}
            </span>
          </div>
          
          {selectedRoteiro?.id === roteiro.id && (
            <div className="roteiro-item-content">
              <div className="roteiro-minutagem">
                <strong>⏱️ Minutagem:</strong> {roteiro.minutagem || 'Não especificada'}
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
