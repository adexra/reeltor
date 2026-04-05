import { NextRequest, NextResponse } from 'next/server';
import { getJob, getOutputPublicUrl } from '../../../../../lib/supabase';

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

  const publicUrl = getOutputPublicUrl(job.output_video_path);
  return NextResponse.redirect(publicUrl, { status: 302 });
}
