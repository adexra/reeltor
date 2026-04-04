import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import type {
  GenerationResult,
  GenerateRequest,
  ReelJob,
  AIGeneratedContent,
  RenderResult,
} from '../../../schema';
import { CLIP_DURATIONS, OUTPUT_DIR } from '../../../schema';
import { processVideo } from '../../../skills/ffmpeg_editor';
import {
  generateCaptions,
  qaCaptions,
  validateAgainstSkill,
  generateHashtags,
} from '../../../skills/ai_copywriter';
import {
  saveJobToLibrary,
  cleanupTmpFiles,
  appendLog,
  appendErrorLog,
} from '../../../skills/library_manager';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── Phase 2a: generate captions for the chosen hook ──────────────────────────

interface CaptionsBody {
  phase: 'captions';
  jobId: string;
  selectedHookId: string;
  selectedHookText: string;
}

// ── Phase 2b: render video with confirmed caption ─────────────────────────────

interface RenderBody {
  phase: 'render';
  jobId: string;
  selectedHookId: string;
  selectedHookText: string;
  selectedCaptionId: string;
}

type RequestBody = CaptionsBody | RenderBody;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.phase === 'captions') {
    return handleCaptions(body);
  } else if (body.phase === 'render') {
    return handleRender(body);
  } else {
    return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
  }
}

// ── Phase 2a handler ──────────────────────────────────────────────────────────

async function handleCaptions(body: CaptionsBody): Promise<NextResponse> {
  const { jobId, selectedHookText } = body;

  try {
    const genPath = path.join(process.cwd(), OUTPUT_DIR, jobId, 'generation.json');
    const genRaw  = await fs.readFile(genPath, 'utf-8');
    const gen     = JSON.parse(genRaw) as GenerationResult & {
      request: GenerateRequest;
      tmpInputPath: string;
    };

    const request = gen.request;

    await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 2 caption generation started. hook="${selectedHookText}"`);

    // Generate captions anchored to chosen hook
    const rawCaptions = await generateCaptions(selectedHookText, request.videoIdea, request.context);

    // QA pass
    const qaCaptionResults = await qaCaptions(rawCaptions, request.context);

    // Skill validation pass (merges scores)
    const validatedCaptions = await validateAgainstSkill(qaCaptionResults, request.context);

    // Mark best
    const best = validatedCaptions.reduce((a, b) => (b.score > a.score ? b : a), validatedCaptions[0]);
    best.isRecommended = true;

    // Generate hashtags using top caption
    const hashtags = await generateHashtags(selectedHookText, best.text, request.context);

    const renderResult: RenderResult = {
      jobId,
      selectedHookText,
      captions:          validatedCaptions,
      hashtags,
      selectedCaptionId: best.id,
      status:            'awaiting_caption',
    };

    // Persist render result
    await fs.writeFile(
      path.join(process.cwd(), OUTPUT_DIR, jobId, 'render_result.json'),
      JSON.stringify(renderResult, null, 2),
      'utf-8',
    );

    await appendLog(`[${new Date().toISOString()}] Job ${jobId} captions generated. count=${validatedCaptions.length}`);

    return NextResponse.json({ renderResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} caption generation error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Phase 2b handler ──────────────────────────────────────────────────────────

async function handleRender(body: RenderBody): Promise<NextResponse> {
  const { jobId, selectedHookText, selectedCaptionId } = body;

  try {
    const genPath    = path.join(process.cwd(), OUTPUT_DIR, jobId, 'generation.json');
    const renderPath = path.join(process.cwd(), OUTPUT_DIR, jobId, 'render_result.json');

    const [genRaw, renderRaw] = await Promise.all([
      fs.readFile(genPath, 'utf-8'),
      fs.readFile(renderPath, 'utf-8'),
    ]);

    const gen         = JSON.parse(genRaw) as GenerationResult & {
      request: GenerateRequest;
      tmpInputPath: string;
    };
    const renderResult = JSON.parse(renderRaw) as RenderResult;

    const selectedCaption = renderResult.captions.find((c) => c.id === selectedCaptionId);
    if (!selectedCaption) {
      return NextResponse.json({ error: 'Invalid captionId' }, { status: 400 });
    }

    const request      = gen.request;
    const tmpInputPath = gen.tmpInputPath;
    const tmpOutputPath = path.join(os.tmpdir(), `${jobId}_output.mp4`);

    let duration: number;
    if (request.durationMode === 'short') {
      const { min, max } = CLIP_DURATIONS.short;
      duration = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      duration = Math.max(
        CLIP_DURATIONS.standard.min,
        Math.min(CLIP_DURATIONS.standard.max, request.customDuration ?? CLIP_DURATIONS.standard.min),
      );
    }

    await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 2 render started. hook="${selectedHookText}"`);

    await processVideo({
      inputPath:  tmpInputPath,
      outputPath: tmpOutputPath,
      startTime:  request.startTime,
      duration,
      hook:       selectedHookText,
      resolution: { width: 1080, height: 1920 },
    });

    await appendLog(`[${new Date().toISOString()}] Job ${jobId} FFmpeg complete`);

    const aiContent: AIGeneratedContent = {
      hook:     selectedHookText,
      caption:  selectedCaption.text,
      hashtags: renderResult.hashtags,
    };

    const reelJob: ReelJob = {
      jobId,
      createdAt:    new Date().toISOString(),
      status:       'done',
      request,
      aiContent,
      outputPath:   null,
      captionPath:  null,
      errorMessage: null,
    };

    const { videoPath, captionPath } = await saveJobToLibrary(reelJob, tmpOutputPath);
    reelJob.outputPath  = videoPath;
    reelJob.captionPath = captionPath;

    const metaPath = path.join(process.cwd(), OUTPUT_DIR, jobId, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(reelJob, null, 2), 'utf-8');

    await cleanupTmpFiles(tmpInputPath);

    await appendLog(`[${new Date().toISOString()}] Job ${jobId} done. Saved to ${videoPath}`);

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} render error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
