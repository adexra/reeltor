import { NextRequest, NextResponse } from 'next/server';
import { getJobVideoPath } from '../../../../../skills/library_manager';
import fs from 'fs';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const videoPath = await getJobVideoPath(jobId);

  if (!videoPath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(videoPath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="reel-${jobId}.mp4"`,
      'Content-Length': String(fileBuffer.length),
    },
  });
}
