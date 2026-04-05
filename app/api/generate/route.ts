import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import type { GenerateRequest, GenerationResult } from '../../../schema';
import { generateHooks, qaHooks } from '../../../skills/ai_copywriter';
import { generateWordTimestamps } from '../../../skills/audio_transcriber';
import { appendLog, appendErrorLog } from '../../../skills/library_manager';
import { emitProgress } from '../../../lib/jobStore';
import {
  createJob,
  uploadRawVideo,
  savePhase1Results,
  failJob,
  updateJobProgress,
  updateJob,
} from '../../../lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const videoFile = formData.get('video')  as File | null;
  const configRaw = formData.get('config') as string | null;

  if (!videoFile || !configRaw) {
    return NextResponse.json({ error: 'Missing video or config' }, { status: 400 });
  }

  let generateRequest: GenerateRequest;
  try {
    generateRequest = JSON.parse(configRaw);
  } catch {
    return NextResponse.json({ error: 'Invalid config JSON' }, { status: 400 });
  }

  // Create the Supabase job row first so we have a stable UUID from the DB
  const jobId = await createJob(generateRequest);

  // Start Phase 1 in background
  runPhase1(jobId, videoFile, generateRequest).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} fatal error: ${message}`);
    await failJob(jobId, message).catch(() => {});
    emitProgress(jobId, { step: 'error', progress: 0, jobId, error: message });
  });

  return NextResponse.json({ jobId }, { status: 202 });
}

async function runPhase1(
  jobId: string,
  videoFile: File,
  request: GenerateRequest,
): Promise<void> {
  const ext = (videoFile.name.split('.').pop() ?? 'mp4').toLowerCase();
  const allowedExtensions = ['mp4', 'mov', 'webm'];

  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Unsupported video format: .${ext}. Allowed: ${allowedExtensions.join(', ')}`);
  }

  await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 1 started`);

  // Step 1 — Buffer upload, persist to Supabase Storage
  emitProgress(jobId, { step: 'upload', progress: 10, jobId, message: 'Uploading video…' });
  await updateJobProgress(jobId, 'upload', 10);

  const buffer = Buffer.from(await videoFile.arrayBuffer());
  const rawVideoPath = await uploadRawVideo(jobId, buffer, ext);

  emitProgress(jobId, { step: 'upload', progress: 20, jobId, message: 'Video saved. Transcribing audio…' });
  await updateJobProgress(jobId, 'upload', 20);

  // Step 2 — Azure Whisper transcription (runs in parallel with hook generation)
  //          We kick it off here and await the result before emitting 'ready'
  //          so the render server has word timestamps available immediately.
  const mimeMap: Record<string, 'video/mp4' | 'video/quicktime' | 'video/webm'> = {
    mp4:  'video/mp4',
    mov:  'video/quicktime',
    webm: 'video/webm',
  };

  const whisperPromise = generateWordTimestamps(
    buffer,
    mimeMap[ext] ?? 'video/mp4',
    `${jobId}.${ext}`,
  ).then(async (result) => {
    await updateJob(jobId, { whisper_transcript: result.words });
    await appendLog(
      `[${new Date().toISOString()}] Job ${jobId} Whisper done. ` +
      `words=${result.words.length} lang=${result.language} dur=${result.duration}s`,
    );
    return result;
  }).catch(async (err) => {
    // Whisper failure is non-fatal — captions still render without timestamps
    const msg = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} Whisper error (non-fatal): ${msg}`);
    return null;
  });

  // Step 3 — Generate 5 hooks (runs concurrently with Whisper)
  emitProgress(jobId, { step: 'generating_hooks', progress: 40, jobId, message: 'Writing 5 hook options…' });
  await updateJobProgress(jobId, 'generating_hooks', 40);

  const rawHooks = await generateHooks(request.videoIdea, request.context);

  // Step 4 — QA score hooks
  emitProgress(jobId, { step: 'qa_hooks', progress: 70, jobId, message: 'Scoring hooks…' });
  await updateJobProgress(jobId, 'qa_hooks', 70);

  const scoredHooks = await qaHooks(rawHooks);
  const topHook = scoredHooks.find((h) => h.isRecommended) ?? scoredHooks[0];

  const result: GenerationResult = {
    jobId,
    hooks:          scoredHooks,
    selectedHookId: topHook.id,
    status:         'awaiting_hook',
  };

  // Step 5 — Persist Phase 1 results to Supabase
  await savePhase1Results(jobId, result);

  // Wait for Whisper to finish (it may already be done by now)
  await whisperPromise;

  await appendLog(
    `[${new Date().toISOString()}] Job ${jobId} Phase 1 complete. ` +
    `hooks=${scoredHooks.length} rawVideoPath=${rawVideoPath}`,
  );

  emitProgress(jobId, { step: 'ready', progress: 100, jobId, message: 'Pick your hook', result });
}
