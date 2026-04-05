import { NextResponse } from 'next/server';
import { supabaseAdmin, getOutputPublicUrl } from '../../../lib/supabase';
import type { ReelJob } from '../../../schema';

export const runtime = 'nodejs';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('reel_jobs')
    .select('*')
    .eq('status', 'done')
    .not('output_video_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs: ReelJob[] = (data ?? []).map((row) => ({
    jobId:     row.id,
    createdAt: row.created_at,
    status:    row.status,
    request: {
      videoIdea:    row.video_idea,
      startTime:    row.start_time,
      durationMode: row.duration_mode,
      context: {
        businessName:       row.business_name,
        targetAudience:     row.target_audience,
        tone:               row.tone,
        productDescription: row.product_desc,
      },
    },
    aiContent: row.selected_hook_text
      ? {
          hook:     row.selected_hook_text,
          caption:  row.selected_caption_text ?? '',
          hashtags: row.hashtags ?? [],
        }
      : null,
    outputPath:   row.output_video_path
      ? getOutputPublicUrl(row.output_video_path)
      : null,
    captionPath:  null,
    errorMessage: row.error_message ?? null,
  }));

  return NextResponse.json(jobs);
}
