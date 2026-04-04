'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { BusinessContext, GenerateRequest, GenerationResult, SSEProgressEvent } from '../schema';
import { CLIP_DURATIONS } from '../schema';
import { ProgressTracker } from './ProgressTracker';

interface Props {
  context: BusinessContext;
  onPhase1Complete: (result: GenerationResult) => void;
}

// Pixel-accurate word wrap — mirrors overlay_renderer.ts wrapText()
// maxWidth is in canvas pixels at the current scale
function wrapHookText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.toUpperCase().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── Phone Frame Preview ──────────────────────────────────────────────────────

interface PreviewProps {
  videoFile: File | null;
  startTime: number;
  hookText: string;
}

function PhonePreview({ videoFile, startTime, hookText }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  // Track whether Bebas Neue is loaded
  const [fontReady, setFontReady] = useState(false);

  // Load Bebas Neue from Google Fonts into the document (for canvas use)
  useEffect(() => {
    if (document.fonts) {
      const bebasUrl = 'url(https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ.woff2)';
      const f = new FontFace('BebasNeue', bebasUrl);
      f.load().then((loaded) => {
        document.fonts.add(loaded);
        setFontReady(true);
      }).catch(() => setFontReady(true)); // fallback: still draw
    } else {
      setFontReady(true);
    }
  }, []);

  // Seek video to startTime and capture frame
  useEffect(() => {
    if (!videoFile || !canvasRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const url = URL.createObjectURL(videoFile);
    video.src = url;
    video.currentTime = startTime;

    const draw = () => {
      // Canvas is 270×480 (1080×1920 / 4) for display
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawOverlay(ctx, hookText, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    };

    video.onseeked = draw;
    video.onerror  = () => { URL.revokeObjectURL(url); };

    return () => { URL.revokeObjectURL(url); };
  }, [videoFile, startTime, hookText, fontReady]);

  // Redraw overlay when hookText changes (no video re-seek needed if same frame)
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // If we have a frame, redraw overlay on top
    if (videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      drawOverlay(ctx, hookText, canvas.width, canvas.height);
    } else if (!videoFile) {
      drawPlaceholder(ctx, hookText, canvas.width, canvas.height);
    }
  }, [hookText, fontReady]);

  // Initial placeholder when no video
  useEffect(() => {
    if (videoFile || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawPlaceholder(ctx, hookText, canvas.width, canvas.height);
  }, [videoFile, hookText, fontReady]);

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">
        Live Preview
      </span>

      {/* Phone bezel */}
      <div
        className="relative rounded-[28px] overflow-hidden"
        style={{
          width: 270,
          height: 480,
          background: '#07080A',
          boxShadow: '0 0 0 3px #1E2329, 0 0 0 5px #0D0F12, 0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-[#07080A] rounded-b-xl z-10" />

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={270}
          height={480}
          className="w-full h-full"
        />

        {/* Safe zone guides */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderLeft:  '27px solid transparent',
            borderRight: '27px solid transparent',
            outline: 'none',
          }}
        >
          {/* Left margin guide */}
          <div className="absolute top-0 bottom-0 left-[10%] w-px border-l border-dashed border-white/10" />
          {/* Right margin guide */}
          <div className="absolute top-0 bottom-0 right-[10%] w-px border-l border-dashed border-white/10" />
          {/* Top safe zone */}
          <div className="absolute left-0 right-0 top-[13%] border-t border-dashed border-white/10" />
          {/* Bottom safe zone */}
          <div className="absolute left-0 right-0 bottom-[17%] border-t border-dashed border-white/10" />
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-white/20" />
      </div>

      <p className="text-[10px] text-[#353D4A] font-mono text-center max-w-[270px] leading-relaxed">
        Preview uses idea text as hook placeholder.
        Final reel uses AI-generated hook.
      </p>

      {/* Hidden video element for frame capture */}
      <video ref={videoRef} className="hidden" crossOrigin="anonymous" playsInline muted />
    </div>
  );
}

function drawOverlay(ctx: CanvasRenderingContext2D, hookText: string, w: number, h: number) {
  const scale = w / 1080; // canvas is 1/4 of 1080 = 270

  // --- GRADIENT SCRIM --- mirrors overlay_renderer.ts exactly
  const scrimTop    = h * 0.22;
  const scrimHeight = h * 0.44;
  const scrimGrad = ctx.createLinearGradient(0, scrimTop, 0, scrimTop + scrimHeight);
  scrimGrad.addColorStop(0,    'rgba(0,0,0,0)');
  scrimGrad.addColorStop(0.25, 'rgba(0,0,0,0.55)');
  scrimGrad.addColorStop(0.5,  'rgba(0,0,0,0.65)');
  scrimGrad.addColorStop(0.75, 'rgba(0,0,0,0.55)');
  scrimGrad.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, scrimTop, w, scrimHeight);

  // --- HOOK TEXT ---
  const FONT_SIZE     = Math.round(88 * scale);
  const LINE_HEIGHT   = FONT_SIZE * 1.1;
  const MAX_TEXT_W    = w * (864 / 1080); // 864px at full res → scaled

  ctx.font         = `${FONT_SIZE}px BebasNeue, Impact, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const rawText = hookText.trim() || 'YOUR HOOK HERE';
  const lines   = wrapHookText(ctx, rawText, MAX_TEXT_W);
  const totalTextHeight = lines.length * LINE_HEIGHT;
  const blockStartY     = h * 0.35 - totalTextHeight / 2;

  lines.forEach((line, i) => {
    const x = w / 2;
    const y = blockStartY + i * LINE_HEIGHT + LINE_HEIGHT / 2;

    // Black stroke outline
    ctx.strokeStyle = 'rgba(0,0,0,0.95)';
    ctx.lineWidth   = 6 * scale;
    ctx.lineJoin    = 'round';
    ctx.strokeText(line, x, y);

    // Drop shadow + white fill
    ctx.shadowColor   = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur    = 12 * scale;
    ctx.shadowOffsetX = 3 * scale;
    ctx.shadowOffsetY = 4 * scale;
    ctx.fillStyle     = '#FFFFFF';
    ctx.fillText(line, x, y);

    // Reset shadow
    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });

  // --- DIVIDER LINE ---
  const dividerY = blockStartY + totalTextHeight + 18 * scale;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 50 * scale, dividerY);
  ctx.lineTo(w / 2 + 50 * scale, dividerY);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth   = 1.5 * scale;
  ctx.stroke();

  // --- CTA ---
  const CTA_FONT_SIZE = Math.round(36 * scale);
  const ctaY          = dividerY + 28 * scale;

  ctx.font         = `${CTA_FONT_SIZE}px 'DM Sans', 'Inter', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle  = 'rgba(0,0,0,0.7)';
  ctx.lineWidth    = 2 * scale;
  ctx.strokeText('Read Description', w / 2, ctaY);
  ctx.fillStyle    = 'rgba(255,255,255,0.72)';
  ctx.fillText('Read Description', w / 2, ctaY);
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, hookText: string, w: number, h: number) {
  // Dark gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0D0F12');
  grad.addColorStop(1, '#07080A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 27) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 27) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // "No video" label
  ctx.fillStyle = 'rgba(90,100,120,0.6)';
  ctx.font = `${Math.round(11 * w / 270)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Upload video to preview', w / 2, h * 0.15);

  drawOverlay(ctx, hookText || 'YOUR HOOK HERE', w, h);
}

// ── Chunked Upload for Large Files ──────────────────────────────────────────

async function uploadInChunks(
  file: File,
  config: GenerateRequest,
  chunkSize: number,
  onProgress: (progress: number) => void
): Promise<string> {
  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploadId = crypto.randomUUID();

  // Initialize upload
  const initRes = await fetch('/api/generate/chunked', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      config,
    }),
  });

  if (!initRes.ok) throw new Error(`Failed to initialize upload: ${initRes.status}`);
  const { jobId } = await initRes.json();

  // Upload chunks
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('chunk', chunk);

    const chunkRes = await fetch('/api/generate/chunked', {
      method: 'PUT',
      body: formData,
    });

    if (!chunkRes.ok) throw new Error(`Failed to upload chunk ${chunkIndex}: ${chunkRes.status}`);

    const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    onProgress(progress);
  }

  // Finalize upload
  const finalizeRes = await fetch('/api/generate/chunked', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });

  if (!finalizeRes.ok) throw new Error(`Failed to finalize upload: ${finalizeRes.status}`);

  return jobId;
}

// ── Main Generator Panel ─────────────────────────────────────────────────────

export function GeneratorPanel({ context, onPhase1Complete }: Props) {
  const [videoFile,      setVideoFile]      = useState<File | null>(null);
  const [isDragging,     setIsDragging]     = useState(false);
  const [videoIdea,      setVideoIdea]      = useState('');
  const [startTime,      setStartTime]      = useState(0);
  const [durationMode,   setDurationMode]   = useState<'short' | 'standard'>('short');
  const [customDuration, setCustomDuration] = useState(15);
  const [isRunning,      setIsRunning]      = useState(false);
  const [progressEvent,  setProgressEvent]  = useState<SSEProgressEvent | null>(null);
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);
  const dropZoneInputId = useId();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isVideoFile(file)) setVideoFile(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isVideoFile(file)) setVideoFile(file);
    e.target.value = '';
  };

  const handleGenerate = async () => {
    if (!videoFile || !videoIdea.trim() || isRunning) return;
    setIsRunning(true);
    setProgressEvent(null);
    setCompletedJobId(null);

    const generateRequest: GenerateRequest = {
      videoIdea,
      startTime,
      durationMode,
      customDuration: durationMode === 'standard' ? customDuration : undefined,
      context,
    };

    let jobId: string;
    try {
      // Check if file is very large (> 500MB) and use chunked upload
      const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
      if (videoFile.size > 500 * 1024 * 1024) {
        setProgressEvent({ step: 'upload', progress: 0, jobId: 'chunked', message: 'Starting chunked upload...' });
        jobId = await uploadInChunks(videoFile, generateRequest, CHUNK_SIZE, (progress) => {
          setProgressEvent({ step: 'upload', progress, jobId: 'chunked', message: `Uploading... ${Math.round(progress)}%` });
        });
      } else {
        // Use regular upload for smaller files
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('config', JSON.stringify(generateRequest));

        const res = await fetch('/api/generate', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        jobId = data.jobId;
      }
    } catch (err) {
      setProgressEvent({ step: 'error', progress: 0, error: err instanceof Error ? err.message : 'Failed to start job' });
      setIsRunning(false);
      return;
    }

    const es = new EventSource(`/api/generate/progress/${jobId}`);
    es.onmessage = (e) => {
      const event: SSEProgressEvent = JSON.parse(e.data);
      setProgressEvent(event);
      if (event.step === 'ready' && event.result) {
        setIsRunning(false);
        es.close();
        onPhase1Complete(event.result);
      } else if (event.step === 'done') {
        setCompletedJobId(jobId);
        setIsRunning(false);
        es.close();
      } else if (event.step === 'error') {
        setIsRunning(false);
        es.close();
      }
    };
    es.onerror = () => {
      setProgressEvent({ step: 'error', progress: 0, error: 'Connection lost' });
      setIsRunning(false);
      es.close();
    };
  };

  const canGenerate = !!videoFile && !!videoIdea.trim() && !!context.businessName && !isRunning;

  return (
    <div className="flex gap-10 w-full max-w-5xl">

      {/* ── Left: Form ── */}
      <div className="flex flex-col gap-7 flex-1 min-w-0">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
              className="text-3xl font-extrabold text-[#EEF2F7] leading-none"
            >
              Generate Reel
            </h1>
            <p className="text-[#5A6478] text-sm mt-2">
              Upload · describe · ship.
            </p>
          </div>
          <a
            href="/library"
            className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest hover:text-[#E8FF47] transition-colors mt-1"
          >
            Library →
          </a>
        </div>

        {/* Upload */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">Video File</span>
          <label
            htmlFor={dropZoneInputId}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`
              relative flex flex-col items-center justify-center h-28 rounded cursor-pointer
              border transition-all duration-200 select-none
              ${isDragging
                ? 'border-[#E8FF47] bg-[#E8FF4708] shadow-[0_0_0_1px_#E8FF4730]'
                : videoFile
                ? 'border-[#E8FF4740] bg-[#E8FF4705]'
                : 'border-dashed border-[#1E2329] hover:border-[#2A3140] hover:bg-[#0D0F12]'}
            `}
          >
            <input id={dropZoneInputId} type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={handleFileChange} className="sr-only" />
            {videoFile ? (
              <div className="flex flex-col items-center gap-1 px-4 text-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8FF47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
                </svg>
                <span className="text-[#E8FF47] text-sm font-mono truncate max-w-xs">{videoFile.name}</span>
                <span className="text-[#353D4A] text-xs">
                  {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                  {videoFile.size > 500 * 1024 * 1024 ? ' · chunked upload' : ''}
                   · click to replace
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#353D4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                </svg>
                <span className="text-[#5A6478] text-sm">Drop or <span className="text-[#EEF2F7] underline underline-offset-2">browse</span></span>
                <span className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest">.mp4 · .mov · .webm · up to 2GB</span>
              </div>
            )}
          </label>
        </div>

        {/* Idea + Start time */}
        <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
          <FormField label="Video Idea / Topic">
            <textarea
              value={videoIdea}
              onChange={(e) => setVideoIdea(e.target.value)}
              placeholder="Morning routine, product reveal, before/after…"
              rows={3}
              className="input-field resize-none"
            />
          </FormField>
          <FormField label="Start (sec)">
            <input
              type="number"
              min={0}
              step={1}
              value={startTime}
              onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
              className="input-field w-20 text-center tabular-nums"
            />
          </FormField>
        </div>

        {/* Duration */}
        <FormField label="Clip Duration">
          <div className="flex gap-2">
            {(['short', 'standard'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setDurationMode(mode)}
                className={`flex-1 py-2.5 px-4 text-xs font-mono rounded border transition-all duration-150 ${
                  durationMode === mode
                    ? 'border-[#E8FF47] bg-[#E8FF4712] text-[#E8FF47]'
                    : 'border-[#1E2329] text-[#5A6478] hover:border-[#2A3140] hover:text-[#EEF2F7]'
                }`}>
                {mode === 'short' ? `Short  ${CLIP_DURATIONS.short.min}–${CLIP_DURATIONS.short.max}s` : `Standard  ${CLIP_DURATIONS.standard.min}–${CLIP_DURATIONS.standard.max}s`}
              </button>
            ))}
          </div>
          {durationMode === 'standard' && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest">{CLIP_DURATIONS.standard.min}s</span>
                <span className="text-sm font-mono text-[#E8FF47]">{customDuration}s</span>
                <span className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest">{CLIP_DURATIONS.standard.max}s</span>
              </div>
              <input type="range" min={CLIP_DURATIONS.standard.min} max={CLIP_DURATIONS.standard.max} value={customDuration} onChange={(e) => setCustomDuration(parseInt(e.target.value))} />
            </div>
          )}
        </FormField>

        {/* Progress */}
        <ProgressTracker event={progressEvent} isRunning={isRunning} />

        {/* Done */}
        {completedJobId && (
          <div className="flex items-center justify-between px-4 py-3 rounded border border-[#E8FF4730] bg-[#E8FF4708]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#E8FF47]" />
              <span className="text-[#E8FF47] text-sm font-mono">Reel ready</span>
            </div>
            <a href="/library" className="text-xs font-mono text-[#E8FF47] opacity-70 hover:opacity-100 transition-opacity">Open Library →</a>
          </div>
        )}

        {/* Generate */}
        <button onClick={handleGenerate} disabled={!canGenerate}
          className={`w-full py-3.5 rounded font-mono text-sm tracking-[0.08em] uppercase transition-all duration-200
            ${canGenerate
              ? 'bg-[#E8FF47] text-[#07080A] font-bold hover:bg-[#F2FF70] active:scale-[0.99]'
              : 'bg-[#0D0F12] text-[#353D4A] border border-[#1E2329] cursor-not-allowed'}`}
        >
          {isRunning ? <span className="flex items-center justify-center gap-2"><SpinnerIcon />Processing…</span> : 'Generate Reel'}
        </button>

        {!context.businessName && !isRunning && (
          <p className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest text-center -mt-4">
            Fill Business Context in sidebar first
          </p>
        )}
      </div>

      {/* ── Right: Phone Preview ── */}
      <div className="shrink-0 hidden lg:flex items-start pt-14">
        <PhonePreview videoFile={videoFile} startTime={startTime} hookText={videoIdea} />
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">{label}</label>
      {children}
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
}
