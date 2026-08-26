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
  const [selectedRoteiro, setSelectedRoteiro] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoteiros() {
      if (!videoId) {
        console.log('⚠️ videoId vazio, não vai buscar');
        setLoading(false);
        return;
      }

      // Normaliza o video_id (remove caracteres especiais, mantém apenas alfanuméricos)
      const normalizedVideoId = videoId.trim();
      console.log('🔍 Buscando roteiros para video_id:', normalizedVideoId);
      
      try {
        // Busca TODOS os roteiros primeiro para debug
        const { data: allData, error: allError } = await supabase
          .from('roteiros')
          .select('*')
          .order('created_at', { ascending: false });

        if (allError) {
          console.error('❌ Erro ao buscar todos:', allError);
        } else {
          console.log('📋 Todos os roteiros:', allData);
        }

        // Busca filtrado pelo video_id (exato)
        const { data, error } = await supabase
          .from('roteiros')
          .select('*')
          .eq('video_id', normalizedVideoId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ Erro na consulta filtrada:', error);
          setError(error.message);
          throw error;
        }

        console.log('✅ Roteiros encontrados para este vídeo:', data);
        setRoteiros(data || []);
        
        if (data && data.length === 0) {
          console.log('⚠️ Nenhum roteiro encontrado para video_id:', normalizedVideoId);
          console.log('💡 Verifique se o ID está correto. IDs no banco:', allData?.map(r => r.video_id));
        }
      } catch (error) {
        console.error('❌ Erro ao carregar roteiros:', error);
        setError('Erro ao carregar roteiros');
      } finally {
        setLoading(false);
      }
    }

    loadRoteiros();
  }, [videoId]);

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
        <p className="text-muted-small" style={{ fontSize: '11px', marginTop: '8px', color: 'var(--text-faint)' }}>
          Debug: video_id = "{videoId}"
        </p>
      </div>
    );
  }

  return (
    <div className="roteiros-list-container">
      {roteiros.map((roteiro) => (
        <div 
          key={roteiro.id} 
          className="roteiro-item"
          onClick={() => setSelectedRoteiro(selectedRoteiro === roteiro.id ? null : roteiro.id)}
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
              {selectedRoteiro === roteiro.id ? '▲' : '▼'}
            </span>
          </div>
          
          {selectedRoteiro === roteiro.id && (
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
