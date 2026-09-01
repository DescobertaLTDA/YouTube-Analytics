// app/api/rpm/importar-csv/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { parseRpmCsv } from '@/lib/rpm-csv-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log('🚀 API /api/rpm/importar-csv iniciada');

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('❌ Nenhum arquivo enviado');
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const csvText = await file.text();
    const { rows, skipped, totalRow } = parseRpmCsv(csvText);

    if (rows.length === 0) {
      return NextResponse.json({
        error: 'Nenhum vídeo com RPM válido encontrado no CSV.',
      }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    let imported = 0;

    for (const row of rows) {
      const { error } = await supabase
        .from('video_rpm_real')
        .upsert({
          youtube_video_id: row.youtube_video_id,
          title: row.title,
          rpm: row.rpm,
          receita: row.receita,
          views: row.views,
          visualizacoes_intencionais: row.visualizacoesIntencionais,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'youtube_video_id',
        });

      if (error) {
        console.error(`❌ Erro ao importar ${row.youtube_video_id}:`, error.message);
      } else {
        imported++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: rows.length,
      totalRow,
      message: `${imported} vídeos importados, ${skipped} ignorados`,
    });

  } catch (error: any) {
    console.error('❌ ERRO NA API:', error.message);
    console.error(error.stack);
    return NextResponse.json({
      error: error.message || 'Erro ao processar o arquivo',
    }, { status: 500 });
  }
}
