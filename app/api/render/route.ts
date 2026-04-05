/**
 * app/api/render/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2 handler — two sub-phases share this route:
 *
 *   POST { phase: 'captions', jobId, selectedHookId, selectedHookText }
 *     → Generates 5 caption options + hashtags via Azure OpenAI.
 *       Pure AI work, no video processing. Returns captions synchronously.
 *
 *   POST { phase: 'render', jobId, selectedHookId, selectedHookText,
 *           selectedCaptionId, design? }
 *     → Fires the Remotion render pipeline on Azure Container Apps.
 *       1. Reads the job row from Supabase (raw_video_path, whisper_transcript).
 *       2. If Whisper transcript is missing, runs it now against the video in
 *          Supabase Storage and saves the result back to the job row.
 *       3. POSTs { jobId } to RENDER_SERVER_URL — the container pulls all
 *          render data from Supabase itself and uploads the final MP4.
 *       4. Returns 202 immediately; frontend polls SSE for completion.
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  GenerationResult,
  GenerateRequest,
  RenderResult,
  DesignConfig,
} from '../../../schema';
import { CLIP_DURATIONS } from '../../../schema';
import {
  generateCaptions,
  qaCaptions,
  validateAgainstSkill,
  generateHashtags,
} from '../../../skills/ai_copywriter';
import { generateWordTimestamps } from '../../../skills/audio_transcriber';
import {
  appendLog,
  appendErrorLog,
} from '../../../skills/library_manager';
import { emitProgress } from '../../../lib/jobStore';
import {
  getJob,
  updateJob,
  updateJobProgress,
  savePhase2Results,
  finalizeJob,
  failJob,
  downloadRawVideo,
} from '../../../lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── Request body shapes ───────────────────────────────────────────────────────

interface CaptionsBody {
  phase: 'captions';
  jobId: string;
  selectedHookId: string;
  selectedHookText: string;
}

interface RenderBody {
  phase: 'render';
  jobId: string;
  selectedHookId: string;
  selectedHookText: string;
  selectedCaptionId: string;
  design?: DesignConfig;
}

type RequestBody = CaptionsBody | RenderBody;

// ── Router ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.phase === 'captions') return handleCaptions(body);
  if (body.phase === 'render')   return handleRender(body);
  return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
}

// ── Phase 2a: generate caption options ────────────────────────────────────────

async function handleCaptions(body: CaptionsBody): Promise<NextResponse> {
  const { jobId, selectedHookText } = body;

  try {
    // Read request context from Supabase instead of local generation.json
    const job = await getJob(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const request: GenerateRequest = {
      videoIdea:  job.video_idea,
      startTime:  Number(job.start_time),
      durationMode: job.duration_mode,
      customDuration: job.custom_duration ?? undefined,
      context: {
        businessName:       job.business_name,
        targetAudience:     job.target_audience,
        tone:               job.tone as GenerateRequest['context']['tone'],
        productDescription: job.product_desc,
      },
    };

    await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 2a started. hook="${selectedHookText}"`);
    await updateJobProgress(jobId, 'generating_captions', 10);

    const rawCaptions       = await generateCaptions(selectedHookText, request.videoIdea, request.context);
    await updateJobProgress(jobId, 'qa_captions', 50);

    const qaCaptionResults  = await qaCaptions(rawCaptions, request.context);
    const validatedCaptions = await validateAgainstSkill(qaCaptionResults, request.context);
    await updateJobProgress(jobId, 'qa_captions', 75);

    const best = validatedCaptions.reduce((a, b) => (b.score > a.score ? b : a), validatedCaptions[0]);
    best.isRecommended = true;

    const hashtags = await generateHashtags(selectedHookText, best.text, request.context);

    const renderResult: RenderResult = {
      jobId,
      selectedHookText,
      captions:          validatedCaptions,
      hashtags,
      selectedCaptionId: best.id,
      status:            'awaiting_caption',
    };

    // Persist to Supabase
    await savePhase2Results(jobId, renderResult);

    await appendLog(`[${new Date().toISOString()}] Job ${jobId} captions done. count=${validatedCaptions.length}`);

    return NextResponse.json({ renderResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} caption error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Phase 2b: trigger Azure render ───────────────────────────────────────────

async function handleRender(body: RenderBody): Promise<NextResponse> {
  const { jobId, selectedHookText, selectedCaptionId, design } = body;

  // Vercel kills the process the moment a response is returned, so we cannot
  // use fire-and-forget here. We must fully await the Azure POST before
  // responding — the container does the heavy lifting asynchronously itself.
  try {
    await triggerAzureRender(jobId, selectedHookText, selectedCaptionId, design);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} render trigger error: ${message}`);
    await failJob(jobId, message).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, jobId, status: 'rendering' },
    { status: 202 },
  );
}

async function triggerAzureRender(
  jobId: string,
  selectedHookText: string,
  selectedCaptionId: string,
  design?: DesignConfig,
): Promise<void> {
  // ── 1. Read job from Supabase ─────────────────────────────────────────────
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found in Supabase.`);
  if (!job.raw_video_path) throw new Error(`Job ${jobId} has no raw_video_path — was Phase 1 completed?`);

  // Resolve selected caption text from the stored captions array
  const captionOptions = (job.captions ?? []) as Array<{ id: string; text: string }>;
  const selectedCaption = captionOptions.find((c) => c.id === selectedCaptionId);
  if (!selectedCaption) throw new Error(`Caption ${selectedCaptionId} not found in job.`);

  await appendLog(`[${new Date().toISOString()}] Job ${jobId} render triggered. hook="${selectedHookText}" caption="${selectedCaptionId}"`);

  // ── 2. Persist final selection + design config ────────────────────────────
  // Write the confirmed hook text, caption text, and design to the job row so
  // the render server can read everything it needs from a single DB row.
  await updateJob(jobId, {
    selected_hook_text:    selectedHookText,
    selected_caption_id:   selectedCaptionId,
    selected_caption_text: selectedCaption.text,
    ...(design && {
      palette:       design.palette,
      font:          design.font,
      animation:     design.animation,
      light_streak:  design.lightStreak,
      text_position: design.textPosition,
      show_cta:      design.showCTA,
    }),
  });

  emitProgress(jobId, { step: 'rendering', progress: 5, jobId, message: 'Preparing render…' });
  await updateJobProgress(jobId, 'rendering', 5);

  // ── 3. Whisper transcript — ensure it exists on the row ───────────────────
  // Phase 1 runs Whisper concurrently with hook generation. If it failed or
  // the transcript is empty for any reason, run it now before dispatching.
  if (!job.whisper_transcript || (job.whisper_transcript as unknown[]).length === 0) {
    await appendLog(`[${new Date().toISOString()}] Job ${jobId} transcript missing — running Whisper now.`);
    emitProgress(jobId, { step: 'rendering', progress: 10, jobId, message: 'Transcribing audio…' });

    try {
      const ext        = job.raw_video_path.split('.').pop() ?? 'mp4';
      const videoBuffer = await downloadRawVideo(job.raw_video_path);

      const mimeMap: Record<string, 'video/mp4' | 'video/quicktime' | 'video/webm'> = {
        mp4:  'video/mp4',
        mov:  'video/quicktime',
        webm: 'video/webm',
      };

      const transcript = await generateWordTimestamps(
        videoBuffer,
        mimeMap[ext] ?? 'video/mp4',
        `${jobId}.${ext}`,
      );

      await updateJob(jobId, { whisper_transcript: transcript.words });
      await appendLog(
        `[${new Date().toISOString()}] Job ${jobId} late Whisper done. words=${transcript.words.length}`,
      );
    } catch (whisperErr) {
      // Non-fatal — render server falls back to static hook overlay
      const msg = whisperErr instanceof Error ? whisperErr.message : String(whisperErr);
      await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} Whisper (late) error (non-fatal): ${msg}`);
    }
  }

  // ── 4. POST to Azure render server ────────────────────────────────────────
  const renderUrl    = process.env.RENDER_SERVER_URL;
  const renderSecret = process.env.RENDER_SECRET;

  if (!renderUrl) throw new Error('RENDER_SERVER_URL is not configured.');

  emitProgress(jobId, { step: 'rendering', progress: 20, jobId, message: 'Dispatching to render server…' });
  await updateJobProgress(jobId, 'rendering', 20);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (renderSecret) headers['x-render-secret'] = renderSecret;

  let renderRes: Response;
  try {
    renderRes = await fetch(renderUrl, {
      method:  'POST',
      headers,
      // The render server reads all render data from Supabase by jobId.
      // We only need to send the ID — everything else is already on the row.
      body:    JSON.stringify({ jobId }),
    });
  } catch (err) {
    throw new Error(
      `Render server unreachable (${renderUrl}): ` +
      (err instanceof Error ? err.message : String(err)),
    );
  }

  if (!renderRes.ok) {
    const body = await renderRes.text().catch(() => '(no body)');
    throw new Error(`Render server HTTP ${renderRes.status}: ${body}`);
  }

  // ── 5. Emit progress — rendering is now running on Azure ─────────────────
  // The container will update reel_jobs.status → 'done' when it finishes.
  // The frontend SSE stream reads from lib/jobStore (in-process emitter) so
  // we emit a "rendering in progress" event here; the done event arrives
  // either via Supabase Realtime (future) or the user refreshing the handoff page.
  await appendLog(`[${new Date().toISOString()}] Job ${jobId} dispatched to render server. Awaiting completion.`);

  emitProgress(jobId, {
    step:     'rendering',
    progress: 25,
    jobId,
    message:  'Rendering on Azure… check back shortly for your video.',
  });
}
