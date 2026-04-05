/**
 * docker/server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reelator Render Server — runs inside Azure Container Apps.
 *
 * POST /render
 *   Body: { jobId, compositionId?, inputProps }
 *   1. Validates the shared secret from X-Render-Secret header.
 *   2. Fetches the reel_jobs row from Supabase to get all render data.
 *   3. Downloads the raw video from the uploads bucket to a tmp file.
 *   4. Bundles the Remotion composition (cached after first request).
 *   5. Renders the MP4 with @remotion/renderer.
 *   6. Uploads the MP4 to the outputs bucket.
 *   7. Updates reel_jobs.status → 'done' and writes the output_video_path.
 *
 * GET /health  →  200 { ok: true }
 */

'use strict';

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const fsp        = require('fs/promises');
const os         = require('os');
const { createClient }  = require('@supabase/supabase-js');
const { bundle }        = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

// ── Env ───────────────────────────────────────────────────────────────────────

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RENDER_SECRET,
  PORT = '3001',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

// ── Supabase admin client ─────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET_UPLOADS = 'reelator-uploads';
const BUCKET_OUTPUTS = 'reelator-outputs';

// ── Remotion bundle cache ─────────────────────────────────────────────────────
// Bundling is expensive (~5–10s). We cache the bundle URL after the first render
// so subsequent requests reuse it. The bundle lives in the container's tmp dir.

let bundleCache = null;

async function getBundle() {
  if (bundleCache) return bundleCache;

  console.log('[bundle] Building Remotion bundle…');
  // The composition entry file is one directory up (Next.js app root)
  const entryPoint = path.resolve(__dirname, '../skills/dynamic-video-editor/index.tsx');

  bundleCache = await bundle({
    entryPoint,
    // Webpack override: alias the schema so the container doesn't need the full
    // Next.js project installed — we copy schema.ts at build time.
    webpackOverride: (config) => config,
  });

  console.log('[bundle] Bundle ready at:', bundleCache);
  return bundleCache;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJobRow(jobId) {
  const { data, error } = await supabase
    .from('reel_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) throw new Error(`fetchJobRow: ${error.message}`);
  if (!data)  throw new Error(`Job not found: ${jobId}`);
  return data;
}

async function setJobStatus(jobId, status, patch = {}) {
  const { error } = await supabase
    .from('reel_jobs')
    .update({ status, current_step: status, ...patch })
    .eq('id', jobId);

  if (error) console.error(`setJobStatus error for ${jobId}:`, error.message);
}

async function downloadToTmp(objectPath, destPath) {
  const { data, error } = await supabase.storage
    .from(BUCKET_UPLOADS)
    .download(objectPath);

  if (error) throw new Error(`downloadToTmp: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  await fsp.writeFile(destPath, buffer);
}

async function uploadOutput(jobId, mp4Path, userId) {
  const prefix     = userId ?? 'anon';
  const objectPath = `${prefix}/${jobId}_output.mp4`;
  const buffer     = await fsp.readFile(mp4Path);

  const { error } = await supabase.storage
    .from(BUCKET_OUTPUTS)
    .upload(objectPath, buffer, { contentType: 'video/mp4', upsert: true });

  if (error) throw new Error(`uploadOutput: ${error.message}`);
  return objectPath;
}

// ── Core render pipeline ──────────────────────────────────────────────────────

async function runRender(jobId) {
  const tmpDir     = os.tmpdir();
  const mp4Out     = path.join(tmpDir, `${jobId}_remotion.mp4`);
  let   rawVideoTmp = null;

  try {
    // ── 1. Mark processing ──────────────────────────────────────────────────
    await setJobStatus(jobId, 'processing', { current_step: 'rendering', progress: 5 });

    // ── 2. Fetch job data ───────────────────────────────────────────────────
    const job = await fetchJobRow(jobId);
    console.log(`[render] Job ${jobId} fetched. hook="${job.selected_hook_text}"`);

    // ── 3. Download raw video to tmp ────────────────────────────────────────
    if (!job.raw_video_path) throw new Error('Job has no raw_video_path — cannot render.');

    const ext = job.raw_video_path.split('.').pop() ?? 'mp4';
    rawVideoTmp = path.join(tmpDir, `${jobId}_raw.${ext}`);
    await downloadToTmp(job.raw_video_path, rawVideoTmp);
    console.log(`[render] Raw video downloaded to ${rawVideoTmp}`);

    await setJobStatus(jobId, 'processing', { current_step: 'rendering', progress: 20 });

    // ── 4. Build inputProps for the Remotion composition ────────────────────
    const inputProps = {
      jobId,
      rawVideoPath:     rawVideoTmp,
      hookText:         job.selected_hook_text ?? '',
      captionText:      job.selected_caption_text ?? '',
      hashtags:         job.hashtags ?? [],
      whisperTranscript: job.whisper_transcript ?? [],
      design: {
        palette:      job.palette      ?? 'neon-yellow',
        font:         job.font         ?? 'bebas',
        animation:    job.animation    ?? 'none',
        lightStreak:  job.light_streak ?? 'none',
        textPosition: job.text_position ?? 'center',
        showCTA:      job.show_cta     ?? false,
      },
      startTime:    Number(job.start_time   ?? 0),
      durationMode: job.duration_mode ?? 'short',
      customDuration: job.custom_duration ?? null,
    };

    // ── 5. Bundle + select composition ──────────────────────────────────────
    const bundleUrl = await getBundle();

    const composition = await selectComposition({
      serveUrl:   bundleUrl,
      id:         'HormoziReel',
      inputProps,
    });

    console.log(`[render] Composition selected: ${composition.id} (${composition.durationInFrames} frames)`);
    await setJobStatus(jobId, 'processing', { current_step: 'rendering', progress: 35 });

    // ── 6. Render ────────────────────────────────────────────────────────────
    await renderMedia({
      composition,
      serveUrl:    bundleUrl,
      codec:       'h264',
      outputLocation: mp4Out,
      inputProps,
      imageFormat: 'jpeg',
      jpegQuality: 90,
      // Log progress every ~10%
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct % 10 === 0) console.log(`[render] ${jobId} → ${pct}%`);
      },
    });

    console.log(`[render] Render complete: ${mp4Out}`);
    await setJobStatus(jobId, 'processing', { current_step: 'saving', progress: 85 });

    // ── 7. Upload to Supabase Storage ────────────────────────────────────────
    const outputPath = await uploadOutput(jobId, mp4Out, job.user_id);
    console.log(`[render] Uploaded to ${outputPath}`);

    // ── 8. Finalize job row ───────────────────────────────────────────────────
    const { data: urlData } = supabase.storage
      .from(BUCKET_OUTPUTS)
      .getPublicUrl(outputPath);

    await setJobStatus(jobId, 'done', {
      current_step:      'done',
      progress:          100,
      output_video_path: outputPath,
      error_message:     null,
    });

    console.log(`[render] Job ${jobId} done. Public URL: ${urlData.publicUrl}`);
    return { outputPath, publicUrl: urlData.publicUrl };

  } finally {
    // Clean up tmp files regardless of success/failure
    for (const f of [mp4Out, rawVideoTmp]) {
      if (f && fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  }
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '1mb' }));

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireSecret(req, res, next) {
  if (!RENDER_SECRET) return next(); // secret not configured — open (dev only)
  const provided = req.headers['x-render-secret'];
  if (!provided || provided !== RENDER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

/**
 * POST /render
 * Body: { jobId: string }
 *
 * Responds immediately with 202 and runs the render pipeline async.
 * The caller should poll the Supabase reel_jobs row for status updates,
 * or listen on SSE via the Next.js /api/generate/progress/[jobId] route.
 */
app.post('/render', requireSecret, async (req, res) => {
  const { jobId } = req.body;

  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'jobId is required' });
  }

  // Respond immediately so the caller doesn't time out
  res.status(202).json({ jobId, status: 'rendering' });

  // Fire render pipeline in background
  runRender(jobId).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[render] FATAL for job ${jobId}:`, message);
    await setJobStatus(jobId, 'error', {
      current_step:  'error',
      error_message: message,
    }).catch(() => {});
  });
});

/**
 * POST /render/sync
 * Same as /render but waits for completion before responding.
 * Use only for short clips or during local development.
 */
app.post('/render/sync', requireSecret, async (req, res) => {
  const { jobId } = req.body;

  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'jobId is required' });
  }

  try {
    const result = await runRender(jobId);
    res.json({ jobId, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'error', {
      current_step:  'error',
      error_message: message,
    }).catch(() => {});
    res.status(500).json({ error: message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const port = Number(PORT);
app.listen(port, () => {
  console.log(`[server] Reelator render server listening on :${port}`);
  console.log(`[server] Supabase project: ${SUPABASE_URL}`);
  console.log(`[server] Secret auth: ${RENDER_SECRET ? 'enabled' : 'DISABLED (dev mode)'}`);
});
