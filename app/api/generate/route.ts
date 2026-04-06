import { NextRequest } from 'next/server';
import type { GenerateRequest, GenerationResult, SSEProgressEvent } from '../../../schema';
import { generateHooks, qaHooks } from '../../../skills/ai_copywriter';
import { generateWordTimestamps } from '../../../skills/audio_transcriber';
import { appendLog, appendErrorLog } from '../../../skills/library_manager';
import {
  createJob,
  downloadRawVideo,
  savePhase1Results,
  failJob,
  updateJobProgress,
  updateJob,
} from '../../../lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { videoPath?: string; jobId?: string; config?: GenerateRequest };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { videoPath, jobId: existingJobId, config: generateRequest } = body;

  if (!videoPath || !generateRequest) {
    return new Response(JSON.stringify({ error: 'Missing videoPath or config' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: SSEProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      let jobId: string;
      try {
        jobId = existingJobId ?? await createJob(generateRequest);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ step: 'error', progress: 0, jobId: '', error: `Failed to create job: ${message}` });
        controller.close();
        return;
      }

      // Emit jobId immediately so the client can store it
      emit({ step: 'upload', progress: 5, jobId, message: 'Job created…' });

      try {
        await runPhase1(jobId, videoPath, generateRequest, emit);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} fatal error: ${message}`);
        await failJob(jobId, message).catch(() => {});
        emit({ step: 'error', progress: 0, jobId, error: message });
      }

      try { controller.close(); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function runPhase1(
  jobId: string,
  rawVideoPath: string,
  request: GenerateRequest,
  emit: (event: SSEProgressEvent) => void,
): Promise<void> {
  const ext = (rawVideoPath.split('.').pop() ?? 'mp4').toLowerCase();

  await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 1 started`);

  // Video is already in Supabase — just record the path on the job row
  emit({ step: 'upload', progress: 15, jobId, message: 'Video uploaded. Transcribing audio…' });
  await updateJob(jobId, { raw_video_path: rawVideoPath });
  await updateJobProgress(jobId, 'upload', 15);

  const mimeMap: Record<string, 'video/mp4' | 'video/quicktime' | 'video/webm'> = {
    mp4:  'video/mp4',
    mov:  'video/quicktime',
    webm: 'video/webm',
  };

  // Download from Supabase for Whisper (server-side, not through Vercel request)
  const buffer = await downloadRawVideo(rawVideoPath);

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
    const msg = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} Whisper error (non-fatal): ${msg}`);
    return null;
  });

  emit({ step: 'generating_hooks', progress: 40, jobId, message: 'Writing 5 hook options…' });
  await updateJobProgress(jobId, 'generating_hooks', 40);

  const rawHooks = await generateHooks(request.videoIdea, request.context);

  emit({ step: 'qa_hooks', progress: 70, jobId, message: 'Scoring hooks…' });
  await updateJobProgress(jobId, 'qa_hooks', 70);

  const scoredHooks = await qaHooks(rawHooks);
  const topHook = scoredHooks.find((h) => h.isRecommended) ?? scoredHooks[0];

  const result: GenerationResult = {
    jobId,
    hooks:          scoredHooks,
    selectedHookId: topHook.id,
    status:         'awaiting_hook',
  };

  await savePhase1Results(jobId, result);
  await whisperPromise;

  await appendLog(
    `[${new Date().toISOString()}] Job ${jobId} Phase 1 complete. ` +
    `hooks=${scoredHooks.length} rawVideoPath=${rawVideoPath}`,
  );


  emit({ step: 'ready', progress: 100, jobId, message: 'Pick your hook', result });
}
