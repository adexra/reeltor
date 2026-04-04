import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import type { GenerateRequest, GenerationResult } from '../../../schema';
import { OUTPUT_DIR } from '../../../schema';
import { generateHooks, qaHooks } from '../../../skills/ai_copywriter';
import { appendLog, appendErrorLog } from '../../../skills/library_manager';
import { emitProgress } from '../../../lib/jobStore';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const jobId = uuidv4();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const videoFile  = formData.get('video')  as File | null;
  const configRaw  = formData.get('config') as string | null;

  if (!videoFile || !configRaw) {
    return NextResponse.json({ error: 'Missing video or config' }, { status: 400 });
  }

  let generateRequest: GenerateRequest;
  try {
    generateRequest = JSON.parse(configRaw);
  } catch {
    return NextResponse.json({ error: 'Invalid config JSON' }, { status: 400 });
  }

  // Start Phase 1 in background — hooks only
  runPhase1(jobId, videoFile, generateRequest).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${jobId} fatal error: ${message}`);
    emitProgress(jobId, { step: 'error', progress: 0, jobId, error: message });
  });

  return NextResponse.json({ jobId }, { status: 202 });
}

async function runPhase1(
  jobId: string,
  videoFile: File,
  request: GenerateRequest,
): Promise<void> {
  const tmpDir = os.tmpdir();
  const ext = (videoFile.name.split('.').pop() ?? 'mp4').toLowerCase();
  const allowedExtensions = ['mp4', 'mov', 'webm'];

  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Unsupported video format: .${ext}. Allowed formats: ${allowedExtensions.join(', ')}`);
  }

  const tmpInputPath = path.join(tmpDir, `${jobId}_input.${ext}`);

  await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 1 started`);

  // Step 1 — Save upload
  emitProgress(jobId, { step: 'upload', progress: 15, jobId, message: 'Saving upload…' });
  const buffer = Buffer.from(await videoFile.arrayBuffer());
  await fs.writeFile(tmpInputPath, buffer);

  // Step 2 — Generate 5 hooks
  emitProgress(jobId, { step: 'generating_hooks', progress: 40, jobId, message: 'Writing 5 hook options…' });
  const rawHooks = await generateHooks(request.videoIdea, request.context);

  // Step 3 — QA score hooks
  emitProgress(jobId, { step: 'qa_hooks', progress: 75, jobId, message: 'Scoring hooks…' });
  const scoredHooks = await qaHooks(rawHooks);

  const topHook = scoredHooks.find((h) => h.isRecommended) ?? scoredHooks[0];

  const result: GenerationResult = {
    jobId,
    hooks:          scoredHooks,
    selectedHookId: topHook.id,
    status:         'awaiting_hook',
  };

  // Persist to disk so Phase 2 can read request + tmpInputPath
  const jobDir = path.join(process.cwd(), OUTPUT_DIR, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(
    path.join(jobDir, 'generation.json'),
    JSON.stringify({ ...result, request, tmpInputPath }, null, 2),
    'utf-8',
  );

  await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 1 complete. hooks=${scoredHooks.length}`);

  emitProgress(jobId, { step: 'ready', progress: 100, jobId, message: 'Pick your hook', result });
}
