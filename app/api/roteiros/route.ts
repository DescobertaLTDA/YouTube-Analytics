import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ✅ GET - Buscar roteiros
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const videoId = searchParams.get('video_id');

    if (!videoId) {
      return NextResponse.json({ error: 'video_id é obrigatório' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('roteiros')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ✅ POST - Salvar roteiro
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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

    if (!video_id || !roteiro) {
      return NextResponse.json({ error: 'video_id e roteiro são obrigatórios' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ✅ PUT - Atualizar roteiro
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, roteiro, minutagem } = body;

    if (!id || !roteiro) {
      return NextResponse.json({ error: 'id e roteiro são obrigatórios' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('roteiros')
      .update({ roteiro: roteiro.trim(), minutagem })
      .eq('id', id)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ✅ DELETE - Deletar roteiro
export async function DELETE(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase
      .from('roteiros')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
