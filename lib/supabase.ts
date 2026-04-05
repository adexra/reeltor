/**
 * lib/supabase.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all Supabase access in Reelator.
 *
 * Two clients are exported:
 *   • supabase        – anon key, safe to import in server components / RSC
 *   • supabaseAdmin   – service-role key, import ONLY in route handlers / server
 *                       actions that already guard their own auth checks.
 *
 * All CRUD helpers in this file use supabaseAdmin so they can bypass RLS
 * from trusted server code. Never call these helpers from the browser.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  ReelJob,
  GenerateRequest,
  GenerationResult,
  RenderResult,
  DesignConfig,
  JobStatus,
  PipelineStep,
  Phase1Step,
  Phase2Step,
} from '../schema';

// ── Env validation ────────────────────────────────────────────────────────────

const SUPABASE_URL            = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY       = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE) {
  throw new Error(
    'Missing Supabase env vars. Ensure SUPABASE_URL, SUPABASE_ANON_KEY, ' +
    'and SUPABASE_SERVICE_ROLE_KEY are set.',
  );
}

// ── Singleton clients (survive hot-reloads in dev) ────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __supabase_anon:  SupabaseClient | undefined;
  // eslint-disable-next-line no-var
  var __supabase_admin: SupabaseClient | undefined;
}

export const supabase: SupabaseClient = globalThis.__supabase_anon ??= createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

export const supabaseAdmin: SupabaseClient = globalThis.__supabase_admin ??= createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ── Storage bucket names ──────────────────────────────────────────────────────

export const BUCKET_UPLOADS = 'reelator-uploads';
export const BUCKET_OUTPUTS = 'reelator-outputs';

// ── Database row type ─────────────────────────────────────────────────────────
// Mirrors the reel_jobs table exactly. Use this for typed query results.

export interface ReelJobRow {
  id:                   string;
  user_id:              string | null;
  status:               JobStatus;
  current_step:         (PipelineStep | Phase1Step | Phase2Step) | null;
  progress:             number | null;
  error_message:        string | null;

  // Request fields
  video_idea:           string;
  start_time:           number;
  duration_mode:        'short' | 'standard';
  custom_duration:      number | null;
  business_name:        string;
  target_audience:      string;
  tone:                 string;
  product_desc:         string;

  // Design
  palette:              string;
  font:                 string;
  animation:            string;
  light_streak:         string;
  text_position:        string;
  show_cta:             boolean;

  // Phase 1
  hooks:                GenerationResult['hooks'] | null;
  selected_hook_id:     string | null;
  selected_hook_text:   string | null;

  // Phase 2
  captions:             RenderResult['captions'] | null;
  hashtags:             string[] | null;
  selected_caption_id:  string | null;
  selected_caption_text: string | null;

  // Storage
  raw_video_path:       string | null;
  output_video_path:    string | null;
  caption_txt_path:     string | null;

  // Whisper
  whisper_transcript:   WhisperWord[] | null;

  created_at:           string;
  updated_at:           string;
}

export interface WhisperWord {
  word:  string;
  start: number;   // seconds
  end:   number;   // seconds
}

// ── Job CRUD ──────────────────────────────────────────────────────────────────

/**
 * Create a new reel job row at the start of Phase 1.
 * Returns the generated UUID.
 */
export async function createJob(
  request: GenerateRequest,
  userId?: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('reel_jobs')
    .insert({
      user_id:         userId ?? null,
      status:          'pending',
      current_step:    'upload',
      progress:        0,

      video_idea:      request.videoIdea,
      start_time:      request.startTime,
      duration_mode:   request.durationMode,
      custom_duration: request.customDuration ?? null,
      business_name:   request.context.businessName,
      target_audience: request.context.targetAudience,
      tone:            request.context.tone,
      product_desc:    request.context.productDescription,
    })
    .select('id')
    .single();

  if (error) throw new Error(`createJob: ${error.message}`);
  return data.id as string;
}

/**
 * Fetch a single job by ID.
 */
export async function getJob(jobId: string): Promise<ReelJobRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reel_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new Error(`getJob: ${error.message}`);
  return data as ReelJobRow | null;
}

/**
 * List all jobs for a user, newest first.
 */
export async function listJobs(
  userId: string,
  limit = 50,
): Promise<ReelJobRow[]> {
  const { data, error } = await supabaseAdmin
    .from('reel_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listJobs: ${error.message}`);
  return (data ?? []) as ReelJobRow[];
}

/**
 * Partial update — pass only the columns you want to change.
 */
export async function updateJob(
  jobId: string,
  patch: Partial<Omit<ReelJobRow, 'id' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('reel_jobs')
    .update(patch)
    .eq('id', jobId);

  if (error) throw new Error(`updateJob: ${error.message}`);
}

/**
 * Convenience: update status + step + progress atomically.
 */
export async function updateJobProgress(
  jobId: string,
  step: ReelJobRow['current_step'],
  progress: number,
  status: JobStatus = 'processing',
  errorMessage?: string,
): Promise<void> {
  await updateJob(jobId, {
    status:        status,
    current_step:  step,
    progress,
    error_message: errorMessage ?? null,
  });
}

/**
 * Persist Phase 1 results (hooks array + pre-selected hook).
 */
export async function savePhase1Results(
  jobId: string,
  result: GenerationResult,
): Promise<void> {
  await updateJob(jobId, {
    status:           'processing',
    current_step:     'ready',
    progress:         100,
    hooks:            result.hooks,
    selected_hook_id: result.selectedHookId,
  });
}

/**
 * Persist Phase 2 results (captions + hashtags) after user picks a hook.
 */
export async function savePhase2Results(
  jobId: string,
  result: RenderResult,
): Promise<void> {
  await updateJob(jobId, {
    current_step:          'captions_ready',
    progress:              60,
    selected_hook_text:    result.selectedHookText,
    captions:              result.captions,
    hashtags:              result.hashtags ?? [],
    selected_caption_id:   result.selectedCaptionId,
  });
}

/**
 * Mark job as fully done and attach storage paths.
 */
export async function finalizeJob(
  jobId: string,
  outputVideoPath: string,
  captionTxtPath: string,
  selectedCaptionText: string,
  design?: DesignConfig,
): Promise<void> {
  await updateJob(jobId, {
    status:               'done',
    current_step:         'done',
    progress:             100,
    output_video_path:    outputVideoPath,
    caption_txt_path:     captionTxtPath,
    selected_caption_text: selectedCaptionText,
    ...(design && {
      palette:       design.palette,
      font:          design.font,
      animation:     design.animation,
      light_streak:  design.lightStreak,
      text_position: design.textPosition,
      show_cta:      design.showCTA,
    }),
  });
}

/**
 * Mark job as errored.
 */
export async function failJob(jobId: string, message: string): Promise<void> {
  await updateJob(jobId, {
    status:        'error',
    current_step:  'error',
    error_message: message,
  });
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/**
 * Upload a raw video buffer to the uploads bucket.
 * Returns the storage object path (e.g. "userId/jobId_input.mp4").
 */
export async function uploadRawVideo(
  jobId: string,
  buffer: Buffer,
  ext: string,
  userId?: string,
): Promise<string> {
  const prefix = userId ?? 'anon';
  const objectPath = `${prefix}/${jobId}_input.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_UPLOADS)
    .upload(objectPath, buffer, {
      contentType:  ext === 'mov' ? 'video/quicktime' : `video/${ext}`,
      upsert:       false,
    });

  if (error) throw new Error(`uploadRawVideo: ${error.message}`);

  await updateJob(jobId, { raw_video_path: objectPath });
  return objectPath;
}

/**
 * Download a raw video from the uploads bucket into a Buffer.
 * Used by Phase 2 render to pull the temp file back from storage.
 */
export async function downloadRawVideo(objectPath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_UPLOADS)
    .download(objectPath);

  if (error) throw new Error(`downloadRawVideo: ${error.message}`);
  const ab = await (data as Blob).arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Upload the finished MP4 to the outputs bucket.
 * Returns the public URL (bucket is public).
 */
export async function uploadOutputVideo(
  jobId: string,
  buffer: Buffer,
  userId?: string,
): Promise<string> {
  const prefix = userId ?? 'anon';
  const objectPath = `${prefix}/${jobId}_output.mp4`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_OUTPUTS)
    .upload(objectPath, buffer, {
      contentType: 'video/mp4',
      upsert:      true,
    });

  if (error) throw new Error(`uploadOutputVideo: ${error.message}`);
  return objectPath;
}

/**
 * Upload the caption .txt file to the outputs bucket.
 */
export async function uploadCaptionFile(
  jobId: string,
  content: string,
  userId?: string,
): Promise<string> {
  const prefix = userId ?? 'anon';
  const objectPath = `${prefix}/${jobId}_caption.txt`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_OUTPUTS)
    .upload(objectPath, Buffer.from(content, 'utf-8'), {
      contentType: 'text/plain',
      upsert:      true,
    });

  if (error) throw new Error(`uploadCaptionFile: ${error.message}`);
  return objectPath;
}

/**
 * Get a public URL for a file in the outputs bucket.
 */
export function getOutputPublicUrl(objectPath: string): string {
  const { data } = supabaseAdmin.storage
    .from(BUCKET_OUTPUTS)
    .getPublicUrl(objectPath);
  return data.publicUrl;
}

/**
 * Create a short-lived signed URL for a private upload (for Phase 2 download).
 * Default expiry: 1 hour.
 */
export async function getUploadSignedUrl(
  objectPath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_UPLOADS)
    .createSignedUrl(objectPath, expiresInSeconds);

  if (error) throw new Error(`getUploadSignedUrl: ${error.message}`);
  return data.signedUrl;
}

// ── A/B Test helpers ──────────────────────────────────────────────────────────

export interface ABTestRow {
  id:             string;
  user_id:        string | null;
  job_a_id:       string;
  job_b_id:       string;
  name:           string | null;
  variant_a_label: string;
  variant_b_label: string;
  winner:         'A' | 'B' | null;
  winner_reason:  string | null;
  created_at:     string;
  updated_at:     string;
}

/**
 * Create an A/B test pairing two jobs.
 */
export async function createABTest(
  jobAId: string,
  jobBId: string,
  opts?: { userId?: string; name?: string; labelA?: string; labelB?: string },
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('ab_tests')
    .insert({
      user_id:         opts?.userId ?? null,
      job_a_id:        jobAId,
      job_b_id:        jobBId,
      name:            opts?.name ?? null,
      variant_a_label: opts?.labelA ?? 'Hook A',
      variant_b_label: opts?.labelB ?? 'Hook B',
    })
    .select('id')
    .single();

  if (error) throw new Error(`createABTest: ${error.message}`);
  return data.id as string;
}

/**
 * Record the winning variant of an A/B test.
 */
export async function resolveABTest(
  testId: string,
  winner: 'A' | 'B',
  reason?: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('ab_tests')
    .update({ winner, winner_reason: reason ?? null })
    .eq('id', testId);

  if (error) throw new Error(`resolveABTest: ${error.message}`);
}
