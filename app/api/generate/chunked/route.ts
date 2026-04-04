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

// Store for chunked uploads (in production, use Redis/database)
const chunkedUploads = new Map<string, {
  fileName: string;
  fileSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  chunksDir: string;
  config: GenerateRequest;
  jobId: string;
}>();

export async function POST(req: NextRequest) {
  // Initialize chunked upload
  const body = await req.json();
  const { uploadId, fileName, fileSize, totalChunks, config } = body;

  const jobId = uuidv4();
  const chunksDir = path.join(os.tmpdir(), `chunks_${uploadId}`);

  await fs.mkdir(chunksDir, { recursive: true });

  chunkedUploads.set(uploadId, {
    fileName,
    fileSize,
    totalChunks,
    uploadedChunks: new Set(),
    chunksDir,
    config,
    jobId,
  });

  return NextResponse.json({ jobId });
}

export async function PUT(req: NextRequest) {
  // Upload a chunk
  const formData = await req.formData();
  const uploadId = formData.get('uploadId') as string;
  const chunkIndex = parseInt(formData.get('chunkIndex') as string);
  const chunk = formData.get('chunk') as File;

  const upload = chunkedUploads.get(uploadId);
  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }

  const chunkPath = path.join(upload.chunksDir, `chunk_${chunkIndex}`);
  const buffer = Buffer.from(await chunk.arrayBuffer());
  await fs.writeFile(chunkPath, buffer);

  upload.uploadedChunks.add(chunkIndex);

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  // Finalize upload and start processing
  const { uploadId } = await req.json();

  const upload = chunkedUploads.get(uploadId);
  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  }

  // Check if all chunks are uploaded
  if (upload.uploadedChunks.size !== upload.totalChunks) {
    return NextResponse.json({ error: 'Not all chunks uploaded' }, { status: 400 });
  }

  // Assemble the file
  const tmpDir = os.tmpdir();
  const ext = upload.fileName.split('.').pop() ?? 'mp4';
  const tmpInputPath = path.join(tmpDir, `${upload.jobId}_input.${ext}`);

  const writeStream = require('fs').createWriteStream(tmpInputPath);
  for (let i = 0; i < upload.totalChunks; i++) {
    const chunkPath = path.join(upload.chunksDir, `chunk_${i}`);
    const chunkBuffer = await fs.readFile(chunkPath);
    writeStream.write(chunkBuffer);
  }
  writeStream.end();

  // Clean up chunks
  await fs.rm(upload.chunksDir, { recursive: true, force: true });
  chunkedUploads.delete(uploadId);

  // Start processing (same as regular upload)
  runPhase1(upload.jobId, tmpInputPath, upload.config).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    await appendErrorLog(`[${new Date().toISOString()}] Job ${upload.jobId} fatal error: ${message}`);
    emitProgress(upload.jobId, { step: 'error', progress: 0, jobId: upload.jobId, error: message });
  });

  return NextResponse.json({ jobId: upload.jobId });
}

async function runPhase1(
  jobId: string,
  tmpInputPath: string,
  request: GenerateRequest,
): Promise<void> {
  await appendLog(`[${new Date().toISOString()}] Job ${jobId} Phase 1 started (chunked upload)`);

  // Step 2 — Generate 5 hooks
  emitProgress(jobId, { step: 'generating_hooks', progress: 40, jobId, message: 'Writing 5 hook options…' });
  const rawHooks = await generateHooks(request.videoIdea, request.context);

  // Step 3 — QA score hooks
  emitProgress(jobId, { step: 'qa_hooks', progress: 75, jobId, message: 'Scoring hooks…' });
  const scoredHooks = await qaHooks(rawHooks);

  const topHook = scoredHooks.find((h) => h.isRecommended) ?? scoredHooks[0];

  const result: GenerationResult = {
    jobId,
    hooks: scoredHooks,
    selectedHookId: topHook.id,
    status: 'awaiting_hook',
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