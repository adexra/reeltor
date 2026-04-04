import fs from 'fs/promises';
import path from 'path';
import type { ReelJob } from '../schema';
import { OUTPUT_DIR, LOG_DIR } from '../schema';

function getOutputDir(): string {
  return path.join(process.cwd(), OUTPUT_DIR);
}

function getLogDir(): string {
  return path.join(process.cwd(), LOG_DIR);
}

export async function saveJobToLibrary(
  job: ReelJob,
  tmpVideoPath: string
): Promise<{ videoPath: string; captionPath: string }> {
  const jobDir = path.join(getOutputDir(), job.jobId);
  await fs.mkdir(jobDir, { recursive: true });

  const videoPath = path.join(jobDir, 'clip.mp4');
  // fs.rename fails across drive letters (EXDEV) — copy then delete instead
  await fs.copyFile(tmpVideoPath, videoPath);
  await fs.unlink(tmpVideoPath);

  const captionContent = [
    job.aiContent?.caption ?? '',
    '',
    '---',
    (job.aiContent?.hashtags ?? []).join(' '),
  ].join('\n');

  const captionPath = path.join(jobDir, 'caption.txt');
  await fs.writeFile(captionPath, captionContent, 'utf-8');

  const metaPath = path.join(jobDir, 'meta.json');
  await fs.writeFile(metaPath, JSON.stringify(job, null, 2), 'utf-8');

  await appendLog(
    `[${new Date().toISOString()}] Job ${job.jobId} saved. hook="${job.aiContent?.hook}" video=${videoPath}`
  );

  return { videoPath, captionPath };
}

export async function listJobs(): Promise<ReelJob[]> {
  const outputDir = getOutputDir();
  let entries: string[];

  try {
    entries = await fs.readdir(outputDir);
  } catch {
    return [];
  }

  const jobs: ReelJob[] = [];

  for (const entry of entries) {
    const metaPath = path.join(outputDir, entry, 'meta.json');
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      jobs.push(JSON.parse(raw) as ReelJob);
    } catch {
      // Skip malformed or missing meta
    }
  }

  // Sort newest first
  return jobs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getJobVideoPath(jobId: string): Promise<string | null> {
  const videoPath = path.join(getOutputDir(), jobId, 'clip.mp4');
  try {
    await fs.access(videoPath);
    return videoPath;
  } catch {
    return null;
  }
}

export async function cleanupTmpFiles(...paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await fs.unlink(p);
    } catch {
      // Ignore if already removed
    }
  }
}

export async function appendLog(message: string): Promise<void> {
  const logPath = path.join(getLogDir(), 'updates.log');
  try {
    await fs.appendFile(logPath, message + '\n', 'utf-8');
  } catch {
    // Non-fatal: log dir may not exist yet in some environments
  }
}

export async function appendErrorLog(message: string): Promise<void> {
  const logPath = path.join(getLogDir(), 'errors.log');
  try {
    await fs.appendFile(logPath, message + '\n', 'utf-8');
  } catch {
    // Non-fatal
  }
}
