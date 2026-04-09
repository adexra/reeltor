import { NextRequest, NextResponse } from 'next/server';
import { getJob, supabaseAdmin, BUCKET_OUTPUTS } from '../../../../../lib/supabase';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job || !job.output_video_path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Proxy the video bytes through Next.js so the browser can trigger a
  // native download via Content-Disposition. A direct redirect to Supabase
  // Storage doesn't work with <a download> on mobile Safari (cross-origin).
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_OUTPUTS)
    .download(job.output_video_path);

  if (error || !data) {
    return NextResponse.json({ error: 'Download failed' }, { status: 502 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'video/mp4',
      'Content-Disposition': `attachment; filename="reel_${jobId}.mp4"`,
      'Content-Length':      String(buffer.byteLength),
    },
  });
}
