'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  BusinessContext,
  GenerateRequest,
  GenerationResult,
  HookOption,
  SSEProgressEvent,
} from '../schema';
import { CLIP_DURATIONS } from '../schema';
import { ProgressTracker } from './ProgressTracker';

interface Props {
  context:          BusinessContext;
  onPhase1Complete: (result: GenerationResult) => void;
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

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

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  hookText: string,
  w: number,
  h: number,
  branding: BrandingProps,
) {
  const scale = w / 1080;

  // Gradient scrim
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

  // Hook text — adaptive font size
  const rawText   = hookText.trim() || 'YOUR HOOK HERE';
  const wordCount = rawText.split(' ').filter(Boolean).length;

  // Short hook (<10 words): scale up between 2.5–3.2 proportionally
  const remBase   = wordCount < 10 ? Math.max(2.5, Math.min(3.2, 3.2 - (wordCount - 1) * 0.08)) : 2.5;
  const FONT_SIZE   = Math.round(remBase * 35 * scale);   // rem → approx px at preview scale
  const LINE_HEIGHT = FONT_SIZE * 1.1;
  const MAX_TEXT_W  = w * (864 / 1080);

  ctx.font         = `${FONT_SIZE}px BebasNeue, Impact, "Arial Black", sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const lines           = wrapHookText(ctx, rawText, MAX_TEXT_W);
  const totalTextHeight = lines.length * LINE_HEIGHT;
  const blockStartY     = h * 0.35 - totalTextHeight / 2;

  lines.forEach((line, i) => {
    const x = w / 2;
    const y = blockStartY + i * LINE_HEIGHT + LINE_HEIGHT / 2;

    ctx.strokeStyle = 'rgba(0,0,0,0.95)';
    ctx.lineWidth   = 6 * scale;
    ctx.lineJoin    = 'round';
    ctx.strokeText(line, x, y);

    ctx.shadowColor   = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur    = 12 * scale;
    ctx.shadowOffsetX = 3 * scale;
    ctx.shadowOffsetY = 4 * scale;
    ctx.fillStyle     = '#FFFFFF';
    ctx.fillText(line, x, y);

    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });

  // Divider
  const dividerY = blockStartY + totalTextHeight + 18 * scale;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 50 * scale, dividerY);
  ctx.lineTo(w / 2 + 50 * scale, dividerY);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth   = 1.5 * scale;
  ctx.stroke();

  // CTA
  const CTA_SIZE = Math.round(36 * scale);
  const ctaY     = dividerY + 28 * scale;
  ctx.font         = `${CTA_SIZE}px 'DM Sans', 'Inter', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle  = 'rgba(0,0,0,0.7)';
  ctx.lineWidth    = 2 * scale;
  ctx.strokeText('Read Description', w / 2, ctaY);
  ctx.fillStyle    = 'rgba(255,255,255,0.72)';
  ctx.fillText('Read Description', w / 2, ctaY);

  // Handle + logo in bottom-left
  const { handle, logoImg } = branding;
  const bottomY = h - 28 * scale;
  let cursorX   = 14 * scale;

  if (logoImg) {
    const logoSize = 28 * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cursorX + logoSize / 2, bottomY, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, cursorX, bottomY - logoSize / 2, logoSize, logoSize);
    ctx.restore();
    // Logo border ring
    ctx.beginPath();
    ctx.arc(cursorX + logoSize / 2, bottomY, logoSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,255,71,0.85)';
    ctx.lineWidth   = 1.5 * scale;
    ctx.stroke();
    cursorX += logoSize + 8 * scale;
  }

  if (handle) {
    const displayHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const handleSize    = Math.round(22 * scale);
    ctx.font         = `700 ${handleSize}px 'DM Sans', sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor   = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur    = 6 * scale;
    ctx.shadowOffsetX = 1 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.fillStyle     = '#FFFFFF';
    ctx.fillText(displayHandle, cursorX, bottomY);
    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  hookText: string,
  w: number,
  h: number,
  branding: BrandingProps,
) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0D0F12');
  grad.addColorStop(1, '#07080A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth   = 1;
  for (let x = 0; x < w; x += 27) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 27) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  ctx.fillStyle = 'rgba(90,100,120,0.6)';
  ctx.font = `${Math.round(11 * w / 270)}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Upload video to preview', w / 2, h * 0.15);

  drawOverlay(ctx, hookText || 'YOUR HOOK HERE', w, h, branding);
}

// ── PhonePreview ──────────────────────────────────────────────────────────────

interface BrandingProps {
  handle:  string;
  logoImg: HTMLImageElement | null;
}

interface PreviewProps {
  videoFile:   File | null;
  startTime:   number;
  hookText:    string;   // only the selected hook (or placeholder)
  branding:    BrandingProps;
}

function PhonePreview({ videoFile, startTime, hookText, branding }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    if (document.fonts) {
      const f = new FontFace(
        'BebasNeue',
        'url(https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ.woff2)',
      );
      f.load().then((loaded) => {
        document.fonts.add(loaded);
        setFontReady(true);
      }).catch(() => setFontReady(true));
    } else {
      setFontReady(true);
    }
  }, []);

  // Full redraw when video frame changes
  useEffect(() => {
    if (!videoFile || !canvasRef.current || !videoRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;

    const url = URL.createObjectURL(videoFile);
    video.src = url;

    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawOverlay(ctx, hookText, canvas.width, canvas.height, branding);
      URL.revokeObjectURL(url);
    };

    const handleLoaded = () => { if (video.readyState >= 1) video.currentTime = startTime; };
    const handleSeeked = () => draw();
    const handleError  = () => URL.revokeObjectURL(url);

    video.addEventListener('loadedmetadata', handleLoaded);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoaded);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile, startTime, fontReady]);

  // Redraw overlay when hook / branding changes (no re-seek)
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;

    if (videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      drawOverlay(ctx, hookText, canvas.width, canvas.height, branding);
    } else if (!videoFile) {
      drawPlaceholder(ctx, hookText, canvas.width, canvas.height, branding);
    }
  }, [hookText, branding, videoFile, fontReady]);

  // Initial placeholder
  useEffect(() => {
    if (videoFile || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;
    drawPlaceholder(ctx, hookText, canvas.width, canvas.height, branding);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile, fontReady]);

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">
        Live Preview
      </span>

      <div
        className="relative rounded-[20px] lg:rounded-[28px] overflow-hidden"
        style={{
          width:     'min(270px, 90vw)',
          height:    'min(480px, 160vw)',
          maxWidth:  270,
          maxHeight: 480,
          background: '#07080A',
          boxShadow: '0 0 0 3px #1E2329, 0 0 0 5px #0D0F12, 0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-[#07080A] rounded-b-xl z-10" />

        <canvas ref={canvasRef} width={270} height={480} className="w-full h-full" />

        {/* Safe-zone guides */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 bottom-0 left-[10%] w-px border-l border-dashed border-white/10" />
          <div className="absolute top-0 bottom-0 right-[10%] w-px border-l border-dashed border-white/10" />
          <div className="absolute left-0 right-0 top-[13%] border-t border-dashed border-white/10" />
          <div className="absolute left-0 right-0 bottom-[17%] border-t border-dashed border-white/10" />
        </div>

        {/* Home bar */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-white/20" />
      </div>

      {/* Hidden video element for frame capture */}
      <video ref={videoRef} className="hidden" crossOrigin="anonymous" playsInline muted />
    </div>
  );
}

// ── Hook Score Badge ──────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? '#39FF14' : score >= 5 ? '#E8FF47' : '#FF6B35';
  return (
    <span
      className="text-[10px] font-mono px-2 py-0.5 rounded border"
      style={{
        color,
        borderColor: `${color}40`,
        background:  `${color}10`,
      }}
    >
      {score}/10
    </span>
  );
}

// ── Hook Cards ────────────────────────────────────────────────────────────────

function HookCards({
  hooks,
  selectedId,
  onSelect,
}: {
  hooks:      HookOption[];
  selectedId: string;
  onSelect:   (hook: HookOption) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">
        Generated Hooks — click to preview
      </span>
      {hooks.map((hook) => {
        const active = hook.id === selectedId;
        return (
          <button
            key={hook.id}
            type="button"
            onClick={() => onSelect(hook)}
            className="w-full text-left p-3.5 rounded border transition-all duration-150"
            style={{
              borderColor: active ? '#E8FF47' : '#1E2329',
              background:  active ? '#E8FF4708' : '#0D0F12',
              boxShadow:   active ? '0 0 0 1px #E8FF4720' : 'none',
            }}
          >
            <div className="flex items-start gap-3">
              {/* Radio dot */}
              <div
                className="mt-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                style={{
                  borderColor: active ? '#E8FF47' : '#2A3140',
                  background:  active ? '#E8FF47' : 'transparent',
                }}
              >
                {active && (
                  <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4L3 5.5L6.5 2" stroke="#07080A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <span className="text-sm text-[#EEF2F7] font-mono leading-snug">{hook.text}</span>
                <div className="flex flex-wrap gap-1.5">
                  <ScoreBadge score={hook.score} />
                  {hook.isRecommended && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#E8FF4740] text-[#E8FF47] bg-[#E8FF4710]">
                      Recommended
                    </span>
                  )}
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#1E2329] text-[#5A6478] bg-[#0D0F12]">
                    {hook.wordCount}w
                  </span>
                  {!hook.spellingOk && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-900/50 text-amber-400 bg-amber-950/30">
                      ⚠ Corrected
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Main GeneratorPanel ───────────────────────────────────────────────────────

export function GeneratorPanel({ context, onPhase1Complete }: Props) {
  const [videoFile,        setVideoFile]        = useState<File | null>(null);
  const [isDragging,       setIsDragging]       = useState(false);
  const [videoIdea,        setVideoIdea]        = useState('');
  const [startTime,        setStartTime]        = useState(0);
  const [durationMode,     setDurationMode]     = useState<'short' | 'standard'>('short');
  const [customDuration,   setCustomDuration]   = useState(15);
  const [isRunning,        setIsRunning]        = useState(false);
  const [progressEvent,    setProgressEvent]    = useState<SSEProgressEvent | null>(null);
  const [completedJobId,   setCompletedJobId]   = useState<string | null>(null);

  // ── Hook state ──────────────────────────────────────────────────────────────
  const [hooks,             setHooks]             = useState<HookOption[]>([]);
  const [selectedHookId,    setSelectedHookId]    = useState('');
  // activePreviewHook drives the canvas — only updated when a hook is selected
  const [activePreviewHook, setActivePreviewHook] = useState('');
  // The full GenerationResult received from the API — held until user confirms
  const [pendingResult,     setPendingResult]     = useState<GenerationResult | null>(null);

  // ── Branding from localStorage (handle + logo for canvas) ──────────────────
  const [branding, setBranding] = useState<BrandingProps>({ handle: '', logoImg: null });

  useEffect(() => {
    // Read handle + logoUrl from localStorage (written by DesignStudio in prior sessions)
    try {
      const raw = localStorage.getItem('reelator_design_prefs');
      if (!raw) return;
      const prefs = JSON.parse(raw) as { handle?: string; logoUrl?: string };

      const handle = prefs.handle ?? '';
      const logoUrl = prefs.logoUrl ?? '';

      if (logoUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => setBranding({ handle, logoImg: img });
        img.onerror = () => setBranding({ handle, logoImg: null });
        img.src = logoUrl;
      } else {
        setBranding({ handle, logoImg: null });
      }
    } catch {}
  }, []);

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

  // Select a hook → update preview immediately
  const handleSelectHook = (hook: HookOption) => {
    setSelectedHookId(hook.id);
    setActivePreviewHook(hook.text);
  };

  const handleGenerate = async () => {
    if (!videoFile || !videoIdea.trim() || isRunning) return;
    setIsRunning(true);
    setProgressEvent(null);
    setCompletedJobId(null);
    setHooks([]);
    setSelectedHookId('');
    setActivePreviewHook('');
    setPendingResult(null);

    const generateRequest: GenerateRequest = {
      videoIdea,
      startTime,
      durationMode,
      customDuration: durationMode === 'standard' ? customDuration : undefined,
      context,
    };

    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('config', JSON.stringify(generateRequest));

    let res: Response;
    try {
      res = await fetch('/api/generate', { method: 'POST', body: formData });
      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`);
    } catch (err) {
      setProgressEvent({ step: 'error', progress: 0, error: err instanceof Error ? err.message : 'Failed to start job' });
      setIsRunning(false);
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';
    let   currentJobId = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: SSEProgressEvent;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.jobId && !currentJobId) currentJobId = event.jobId;
          setProgressEvent(event);

          if (event.step === 'ready' && event.result) {
            // Populate hook cards; auto-select the recommended one
            const result = event.result;
            setPendingResult(result);
            setHooks(result.hooks);
            const recommended = result.hooks.find((h) => h.isRecommended) ?? result.hooks[0];
            if (recommended) {
              setSelectedHookId(recommended.id);
              setActivePreviewHook(recommended.text);
            }
            setIsRunning(false);
            // Do NOT hand off yet — wait for user to confirm their hook selection below
            return;
          } else if (event.step === 'done') {
            if (currentJobId) setCompletedJobId(currentJobId);
            setIsRunning(false);
            return;
          } else if (event.step === 'error') {
            setIsRunning(false);
            return;
          }
        }
      }
    } catch (err) {
      setProgressEvent({ step: 'error', progress: 0, error: err instanceof Error ? err.message : 'Connection lost' });
      setIsRunning(false);
    }
  };

  const canGenerate = !!videoFile && !!videoIdea.trim() && !!context.businessName && !isRunning;

  // The preview hook: if no hook selected yet, show empty (placeholder drawn in canvas)
  const previewHookText = activePreviewHook;

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 w-full max-w-5xl mx-auto">

      {/* ── Mobile Preview (top on mobile) ── */}
      <div className="lg:hidden flex justify-center mb-4">
        <PhonePreview
          videoFile={videoFile}
          startTime={startTime}
          hookText={previewHookText}
          branding={branding}
        />
      </div>

      {/* ── Left: Form ── */}
      <div className="flex flex-col gap-6 lg:gap-7 flex-1 min-w-0 order-2 lg:order-1">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
              className="text-3xl font-extrabold text-[#EEF2F7] leading-none"
            >
              Generate Reel
            </h1>
            <p className="text-[#5A6478] text-sm mt-2">Upload · describe · ship.</p>
          </div>
          <a
            href="/library"
            className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest hover:text-[#E8FF47] transition-colors mt-1"
          >
            Library →
          </a>
        </div>

        {/* Upload */}
        <div className="flex flex-col gap-3 md:gap-2">
          <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">Video File</span>
          <label
            htmlFor={dropZoneInputId}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`
              relative flex flex-col items-center justify-center h-32 md:h-28 rounded-lg cursor-pointer
              border-2 transition-all duration-200 select-none
              ${isDragging
                ? 'border-[#E8FF47] bg-[#E8FF4708] shadow-[0_0_0_1px_#E8FF4730] scale-[1.02]'
                : videoFile
                ? 'border-[#E8FF4740] bg-[#E8FF4705] shadow-sm'
                : 'border-dashed border-[#1E2329] hover:border-[#2A3140] hover:bg-[#0D0F12] active:scale-[0.98]'
              }
            `}
          >
            <input
              id={dropZoneInputId}
              type="file"
              accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
              onChange={handleFileChange}
              className="sr-only"
            />
            {videoFile ? (
              <div className="flex flex-col items-center gap-1 px-4 text-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8FF47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2"/>
                  <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
                </svg>
                <span className="text-[#E8FF47] text-sm font-mono truncate max-w-xs">{videoFile.name}</span>
                <span className="text-[#353D4A] text-xs">
                  {(videoFile.size / 1024 / 1024).toFixed(1)} MB · click to replace
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

        {/* Video Idea — raw notes, never shown on preview */}
        <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
          <FormField label="Video Idea / Notes">
            <textarea
              value={videoIdea}
              onChange={(e) => setVideoIdea(e.target.value)}
              placeholder="Morning routine, product reveal, before/after… dump your raw notes here. The AI will extract the hook."
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
                {mode === 'short'
                  ? `Short  ${CLIP_DURATIONS.short.min}–${CLIP_DURATIONS.short.max}s`
                  : `Standard  ${CLIP_DURATIONS.standard.min}–${CLIP_DURATIONS.standard.max}s`}
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
              <input
                type="range"
                min={CLIP_DURATIONS.standard.min}
                max={CLIP_DURATIONS.standard.max}
                value={customDuration}
                onChange={(e) => setCustomDuration(parseInt(e.target.value))}
              />
            </div>
          )}
        </FormField>

        {/* Progress */}
        <ProgressTracker event={progressEvent} isRunning={isRunning} />

        {/* Hook cards — appear after generation, before confirmation */}
        {hooks.length > 0 && !isRunning && (
          <>
            <HookCards
              hooks={hooks}
              selectedId={selectedHookId}
              onSelect={handleSelectHook}
            />
            {pendingResult && selectedHookId && (
              <button
                onClick={() => {
                  // Patch the result with the user's chosen hook before handing off
                  const chosenHook = hooks.find((h) => h.id === selectedHookId)!;
                  onPhase1Complete({
                    ...pendingResult,
                    selectedHookId: chosenHook.id,
                  });
                }}
                className="w-full py-3.5 bg-[#E8FF47] text-[#07080A] font-bold font-mono text-sm rounded hover:bg-[#F2FF70] active:scale-[0.99] transition-all uppercase tracking-[0.08em]"
              >
                Use this hook → write captions
              </button>
            )}
          </>
        )}

        {/* Done */}
        {completedJobId && (
          <div className="flex items-center justify-between px-4 py-3 rounded border border-[#E8FF4730] bg-[#E8FF4708]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#E8FF47]" />
              <span className="text-[#E8FF47] text-sm font-mono">Reel ready</span>
            </div>
            <a href="/library" className="text-xs font-mono text-[#E8FF47] opacity-70 hover:opacity-100 transition-opacity">
              Open Library →
            </a>
          </div>
        )}

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full py-4 md:py-3.5 rounded-lg md:rounded font-mono text-sm tracking-[0.08em] uppercase transition-all duration-200 active:scale-[0.96] touch-manipulation
            ${canGenerate
              ? 'bg-[#E8FF47] text-[#07080A] font-bold hover:bg-[#F2FF70] shadow-lg hover:shadow-xl active:shadow-md'
              : 'bg-[#0D0F12] text-[#353D4A] border border-[#1E2329] cursor-not-allowed'
            }`}
        >
          {isRunning
            ? <span className="flex items-center justify-center gap-2"><SpinnerIcon />Processing…</span>
            : hooks.length > 0 ? 'Regenerate Hooks' : 'Generate Hooks'
          }
        </button>

        {!context.businessName && !isRunning && (
          <p className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest text-center -mt-4">
            Fill Business Context in sidebar first
          </p>
        )}
      </div>

      {/* ── Right: Phone Preview ── */}
      <div className="shrink-0 hidden lg:flex items-start pt-14">
        <PhonePreview
          videoFile={videoFile}
          startTime={startTime}
          hookText={previewHookText}
          branding={branding}
        />
      </div>

    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
