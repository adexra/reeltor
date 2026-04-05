import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '../../../../../lib/supabase';

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

  return NextResponse.json({
    status:        job.status,
    progress:      job.progress ?? 0,
    outputUrl:     job.output_video_path ?? null,
    errorMessage:  job.error_message ?? null,
    lastHeartbeat: (job as unknown as { last_heartbeat?: string }).last_heartbeat ?? null,
  });
}
