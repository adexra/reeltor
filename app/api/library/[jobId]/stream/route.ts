import { NextRequest, NextResponse } from 'next/server';
import { getJob, supabaseAdmin, BUCKET_OUTPUTS } from '../../../../../lib/supabase';

export const runtime = 'nodejs';

/**
 * GET /api/library/[jobId]/stream
 * Streams the output video with the correct Content-Type so mobile Safari
 * can play it inline (avoids cross-origin and content-type issues with
 * direct Supabase public URLs).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job || !job.output_video_path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_OUTPUTS)
    .download(job.output_video_path);

  if (error || !data) {
    return NextResponse.json({ error: 'Stream failed' }, { status: 502 });
  }

  const ext         = job.output_video_path.split('.').pop()?.toLowerCase() ?? 'mp4';
  const contentType = ext === 'webm' ? 'video/webm' : 'video/mp4';

  const buffer = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':  contentType,
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}
