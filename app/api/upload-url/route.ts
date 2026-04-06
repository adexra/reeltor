/**
 * app/api/upload-url/route.ts
 * Returns a signed upload URL so the browser can PUT a video directly to
 * Supabase Storage without proxying the file through Vercel.
 * Also creates the reel_jobs row so the jobId is valid before /api/generate runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, BUCKET_UPLOADS, createJob } from '../../../lib/supabase';
import type { GenerateRequest } from '../../../schema';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { ext?: string; config: GenerateRequest };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.config) {
    return NextResponse.json({ error: 'Missing config' }, { status: 400 });
  }

  const ext = (body.ext ?? 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase();

  // Create the job row first so the jobId is valid in the DB
  let jobId: string;
  try {
    jobId = await createJob(body.config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to create job: ${message}` }, { status: 500 });
  }

  const path = `anon/${jobId}_input.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_UPLOADS)
    .createSignedUploadUrl(path);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, path, jobId });
}
