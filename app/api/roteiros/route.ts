import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ✅ GET - Buscar roteiros
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const videoId = searchParams.get('video_id');

    console.log('📥 GET /api/roteiros - video_id:', videoId);

    if (!videoId) {
      return NextResponse.json({ error: 'video_id é obrigatório' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('roteiros')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar roteiros:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ Roteiros encontrados:', data?.length || 0);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('❌ Erro na GET:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno' },
      { status: 500 }
    );
  }
}

// ✅ POST - Salvar roteiro
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('📥 POST /api/roteiros - Dados:', body);

    const {
      video_id,
      video_title,
      video_label,
      roteiro,
      minutagem,
      youtube_video_id,
      source_title,
      segment_count,
      duration_seconds
    } = body;

    if (!video_id) {
      return NextResponse.json({ error: 'video_id é obrigatório' }, { status: 400 });
    }

    if (!roteiro || roteiro.trim().length === 0) {
      return NextResponse.json({ error: 'roteiro é obrigatório' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('roteiros')
      .insert([{
        video_id,
        video_title: video_title || 'Sem título',
        video_label: video_label || 'Vídeo',
        roteiro: roteiro.trim(),
        minutagem: minutagem || 'Transcript completo',
        youtube_video_id: youtube_video_id || null,
        source_title: source_title || null,
        segment_count: segment_count || 0,
        duration_seconds: duration_seconds || 0
      }])
      .select();

    if (error) {
      console.error('❌ Erro Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('✅ Roteiro salvo com sucesso:', data);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('❌ Erro na POST:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
