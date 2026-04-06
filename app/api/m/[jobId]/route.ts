import { NextRequest, NextResponse } from 'next/server';
import { getJob, getOutputPublicUrl } from '../../../../lib/supabase';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const videoUrl = job.output_video_path
    ? getOutputPublicUrl(job.output_video_path)
    : null;

  return NextResponse.json({
    status:      job.status,
    videoUrl,
    captionText: job.selected_caption_text ?? null,
    hashtags:    job.hashtags ?? [],
  });
}
