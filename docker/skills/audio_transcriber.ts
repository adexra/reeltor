/**
 * skills/audio_transcriber.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Azure OpenAI Whisper — word-level transcript generation.
 *
 * Primary env var (preferred — exact URL, no construction needed):
 *   AZURE_WHISPER_ENDPOINT
 *     Full URL including deployment + api-version query string, e.g.:
 *     https://luan-mnl1ynqy-eastus2.cognitiveservices.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2024-06-01
 *
 * Fallback env vars (used only if AZURE_WHISPER_ENDPOINT is not set):
 *   AZURE_OPENAI_ENDPOINT           — base resource URL
 *   AZURE_OPENAI_WHISPER_DEPLOYMENT — deployment name, e.g. "whisper"
 *
 * Auth key (shared across all Azure OpenAI resources in this project):
 *   AZURE_OPENAI_KEY  (alias: AZURE_OPENAI_API_KEY)
 *
 * Azure Whisper constraints:
 *   • Max file size: 25 MB
 *   • Supported formats: mp4, mov, webm, mp3, wav, m4a, ogg, flac, webm
 *   • response_format=verbose_json + timestamp_granularities[]=word gives
 *     per-word { word, start, end } objects — exactly what Remotion needs.
 */

export interface WordTimestamp {
  word:  string;   // trimmed, no leading space
  start: number;   // seconds from start of clip
  end:   number;   // seconds from start of clip
}

export interface TranscriptResult {
  words:    WordTimestamp[];
  text:     string;    // full plain-text transcript
  language: string;    // ISO 639-1 code Whisper detected, e.g. "en", "pt"
  duration: number;    // total audio duration in seconds
}

type SupportedMime =
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/mp4'
  | 'audio/ogg';

/**
 * getWhisperTranscript
 * Alias: original function name, returns WordTimestamp[] directly.
 */
export async function getWhisperTranscript(audioBuffer: Buffer): Promise<WordTimestamp[]> {
  const result = await generateWordTimestamps(audioBuffer);
  return result.words;
}

/**
 * getWordLevelTimestamps
 * Alias matching the spec name used in Step 1 of the context.
 */
export async function getWordLevelTimestamps(audioBuffer: Buffer): Promise<WordTimestamp[]> {
  const result = await generateWordTimestamps(audioBuffer);
  return result.words;
}

/**
 * generateWordTimestamps
 *
 * Full implementation. Returns the complete TranscriptResult including
 * detected language and duration alongside the word array.
 *
 * @param input    Raw bytes as a Buffer, or an absolute local file path.
 * @param mime     MIME type. Defaults to 'video/mp4'.
 * @param filename Filename hint sent in the multipart form (Whisper uses the
 *                 extension to detect format). Defaults to 'clip.mp4'.
 */
export async function generateWordTimestamps(
  input: Buffer | string,
  mime: SupportedMime = 'video/mp4',
  filename = 'clip.mp4',
): Promise<TranscriptResult> {
  // ── Resolve API URL ────────────────────────────────────────────────────────
  // AZURE_WHISPER_ENDPOINT is the complete URL; use it directly if present.
  // Otherwise, construct from the base endpoint + deployment name.
  const apiKey = process.env.AZURE_OPENAI_KEY ?? process.env.AZURE_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      '[audio_transcriber] AZURE_OPENAI_KEY is required.',
    );
  }

  let whisperUrl = process.env.AZURE_WHISPER_ENDPOINT;

  if (!whisperUrl) {
    const endpoint   = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT ?? 'whisper';

    if (!endpoint) {
      throw new Error(
        '[audio_transcriber] Set AZURE_WHISPER_ENDPOINT (full URL) or both ' +
        'AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_WHISPER_DEPLOYMENT.',
      );
    }

    whisperUrl =
      `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}` +
      `/audio/transcriptions?api-version=2024-06-01`;
  }

  // ── Resolve input → Buffer ─────────────────────────────────────────────────
  let buf: Buffer;
  if (typeof input === 'string') {
    const { readFile } = await import('fs/promises');
    buf = await readFile(input);
  } else {
    buf = input;
  }

  if (buf.byteLength === 0) {
    throw new Error('[audio_transcriber] Empty buffer — nothing to transcribe.');
  }

  const sizeMB = buf.byteLength / 1024 / 1024;
  if (sizeMB > 25) {
    throw new Error(
      `[audio_transcriber] File is ${sizeMB.toFixed(1)} MB — Azure Whisper limit is 25 MB. ` +
      'Extract audio with FFmpeg before calling this function.',
    );
  }

  // ── Build multipart/form-data ──────────────────────────────────────────────
  // Node's Buffer.buffer may be a SharedArrayBuffer, which the Blob constructor
  // rejects in strict TypeScript environments. Copy into a plain ArrayBuffer.
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);

  const form = new FormData();
  form.append('file', new Blob([ab], { type: mime }), filename);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  // ── POST to Azure Whisper ──────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(whisperUrl, {
      method:  'POST',
      headers: { 'api-key': apiKey },
      body:    form,
    });
  } catch (err) {
    throw new Error(
      '[audio_transcriber] Network error: ' +
      (err instanceof Error ? err.message : String(err)),
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`[audio_transcriber] Azure Whisper HTTP ${res.status}: ${body}`);
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  const data = await res.json() as {
    text:      string;
    language?: string;
    duration?: number;
    words?:    Array<{ word: string; start: number; end: number }>;
    segments?: unknown;
  };

  if (!data.text) {
    throw new Error('[audio_transcriber] Whisper returned an empty transcript.');
  }

  // Whisper prefixes words with a space character — strip it.
  // Also drop any zero-length tokens that occasionally appear.
  const words: WordTimestamp[] = (data.words ?? [])
    .map((w) => ({ word: w.word.trim(), start: w.start, end: w.end }))
    .filter((w) => w.word.length > 0);

  return {
    words,
    text:     data.text.trim(),
    language: data.language ?? 'unknown',
    duration: data.duration ?? 0,
  };
}

