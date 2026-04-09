/**
 * app/api/record-data/[jobId]/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves all data the browser recorder needs:
 *   - signed URL for the raw video (private uploads bucket)
 *   - hook text
 *   - full design config
 *   - clip duration in seconds
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getJob,
  supabaseAdmin,
  BUCKET_UPLOADS,
} from '../../../../lib/supabase';
import type { DesignConfig } from '../../../../schema';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (!job.raw_video_path) return NextResponse.json({ error: 'No raw video on job' }, { status: 404 });

  // Signed URL for the raw video — valid for 1 hour
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(BUCKET_UPLOADS)
    .createSignedUrl(job.raw_video_path, 3600);

  if (signedError) {
    return NextResponse.json({ error: signedError.message }, { status: 502 });
  }

  // Resolve design — prefer full design_config, fall back to individual columns
  const baseDesign: DesignConfig = {
    palette:      (job.palette ?? 'neon-yellow') as DesignConfig['palette'],
    font:         (job.font        ?? 'bebas')      as DesignConfig['font'],
    animation:    (job.animation   ?? 'none')       as DesignConfig['animation'],
    lightStreak:  (job.light_streak ?? 'none')      as DesignConfig['lightStreak'],
    textPosition: (job.text_position ?? 'center')   as DesignConfig['textPosition'],
    showCTA:      job.show_cta ?? false,
  };

  const design: DesignConfig = job.design_config
    ? { ...baseDesign, ...(job.design_config as DesignConfig) }
    : baseDesign;

  // Clip duration
  const duration =
    job.duration_mode === 'short'
      ? Math.min(5, job.custom_duration ?? 5)
      : Math.min(job.custom_duration ?? 15, 180);

  return NextResponse.json({
    rawVideoUrl: signedData.signedUrl,
    hookText:    job.selected_hook_text ?? '',
    design,
    duration,
  });
}
