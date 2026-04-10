/**
 * app/api/render/browser-complete/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Called by the browser recorder (/record/[jobId]) once it has finished
 * recording and wants to upload the resulting video blob.
 *
 * POST — multipart/form-data
 *   Fields:
 *     jobId   — string
 *     video   — Blob (webm or mp4)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getJob,
  supabaseAdmin,
  BUCKET_OUTPUTS,
  updateJob,
} from '../../../../lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const jobId    = formData.get('jobId') as string | null;
  const videoBlob = formData.get('video') as Blob | null;

  if (!jobId || !videoBlob) {
    return NextResponse.json({ error: 'Missing jobId or video' }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Always save as webm — MediaRecorder output is always webm on all browsers
  const mime       = 'video/webm';
  const prefix     = job.user_id ?? 'anon';
  const objectPath = `${prefix}/${jobId}_output.webm`;

  const buffer = Buffer.from(await videoBlob.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET_OUTPUTS)
    .upload(objectPath, buffer, { contentType: mime, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 502 });
  }

  await updateJob(jobId, {
    status:            'done',
    current_step:      'done',
    progress:          100,
    output_video_path: objectPath,
    error_message:     null,
  });

  // Return a signed URL so the client can auto-trigger download immediately
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(BUCKET_OUTPUTS)
    .createSignedUrl(objectPath, 3600); // 1 hour

  const downloadUrl = signedError || !signedData
    ? `/api/library/${jobId}/download`  // fallback to proxy route
    : signedData.signedUrl;

  return NextResponse.json({ ok: true, objectPath, downloadUrl });
}
