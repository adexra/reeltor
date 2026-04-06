/**
 * app/api/upload-url/route.ts
 * Returns a signed upload URL so the browser can PUT a video directly to
 * Supabase Storage without proxying the file through Vercel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, BUCKET_UPLOADS } from '../../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { ext?: string; jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ext    = (body.ext ?? 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const jobId  = body.jobId ?? uuidv4();
  const path   = `anon/${jobId}_input.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_UPLOADS)
    .createSignedUploadUrl(path);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, path, jobId });
}
