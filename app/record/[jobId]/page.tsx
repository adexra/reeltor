'use client';

/**
 * app/record/[jobId]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser Recorder — V2 render pipeline.
 *
 * Loads the raw video + job design from Supabase, plays it with an HTML
 * overlay (hook text, handle, logo, light streak) and records the result
 * using MediaRecorder. The blob is uploaded via /api/render/browser-complete
 * which marks the job done — same end-state as the Remotion path.
 *
 * Flow:
 *   1. Fetch job data from /api/m/[jobId] (reuses existing endpoint)
 *   2. Fetch design_config from /api/render/status/[jobId]
 *   3. Show preview — user sees exactly what will be recorded
 *   4. User clicks Record → MediaRecorder captures for clip duration
 *   5. Upload blob → job marked done → redirect to home with doneJobId
 */

import { use, useEffect, useRef, useState } from 'react';
import type { DesignConfig } from '../../../schema';

// ── Palette colours (mirrors HormoziReel.tsx) ─────────────────────────────────
const PALETTE_HEX: Record<string, { primary: string; glow: string }> = {
  'neon-yellow':   { primary: '#E8FF47', glow: 'rgba(232,255,71,0.7)' },
  'electric-blue': { primary: '#3B82F6', glow: 'rgba(59,130,246,0.7)' },
  'hot-pink':      { primary: '#FF2D78', glow: 'rgba(255,45,120,0.7)' },
  'cyber-green':   { primary: '#39FF14', glow: 'rgba(57,255,20,0.7)' },
  'pure-white':    { primary: '#FFFFFF', glow: 'rgba(255,255,255,0.5)' },
  'fire-orange':   { primary: '#FF6B35', glow: 'rgba(255,107,53,0.7)' },
};

const FONT_FAMILY: Record<string, string> = {
  bebas:      '"Bebas Neue", Impact, sans-serif',
  impact:     'Impact, "Arial Narrow", sans-serif',
  oswald:     '"Oswald", "Bebas Neue", sans-serif',
  montserrat: '"Montserrat", "DM Sans", sans-serif',
};

const POSITION_Y: Record<string, string> = {
  top:    '22%',
  center: '38%',
  bottom: '72%',
};

interface JobInfo {
  videoUrl:    string;
  hookText:    string;
  captionText: string;
  hashtags:    string[];
  design:      DesignConfig;
  duration:    number;  // seconds
}

// ── Hook overlay (pure CSS — exactly what gets recorded) ──────────────────────

function HookOverlay({ hookText, design }: { hookText: string; design: DesignConfig }) {
  const palette     = design.paletteColors ?? PALETTE_HEX[design.palette] ?? PALETTE_HEX['neon-yellow'];
  const accentColor = design.paletteColors?.primary ?? (palette as { primary: string }).primary;
  const glowColor   = design.paletteColors?.accent  ?? (PALETTE_HEX[design.palette] ?? PALETTE_HEX['neon-yellow']).glow;
  const fontFamily  = FONT_FAMILY[design.font ?? 'bebas'] ?? FONT_FAMILY.bebas;
  const posY        = POSITION_Y[design.textPosition ?? 'center'] ?? '38%';

  // Font size: base 40px/rem at 1080px canvas. We render at 390px tall (9:16),
  // so scale factor ≈ 390/1920 ≈ 0.203. hookFontSize default 2.5rem * 40px = 100px
  // scaled → ~20px preview. We use vw-relative sizing so it looks right at any size.
  const hookFontSize = design.hookFontSize ?? 2.5;
  // 1080px wide canvas → hookFontPx = hookFontSize * 40. Preview container is ~390px tall
  // 9:16 ratio → width ≈ 219px. Scale: 219/1080 ≈ 0.203
  const SCALE = 0.203;
  const hookPx = Math.round(hookFontSize * 40 * SCALE);
  const basePx = Math.round((design.baseFontSize ?? 1.0) * 40 * SCALE);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Scrim */}
      <div style={{
        position:   'absolute',
        left:       0, right: 0,
        top:        `calc(${posY} - 18%)`,
        height:     '44%',
        background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.65) 30%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.65) 70%, transparent)',
      }} />

      {/* Hook text */}
      <div style={{
        position:   'absolute',
        left:       0, right: 0,
        top:        posY,
        transform:  'translateY(-50%)',
        padding:    '0 12px',
        textAlign:  'center',
        fontFamily,
        fontSize:   hookPx,
        fontWeight: 900,
        lineHeight: 1.1,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        color:      accentColor,
        textShadow: `0 0 20px ${glowColor}, 2px 3px 0 rgba(0,0,0,0.95)`,
        WebkitTextStroke: '1px rgba(0,0,0,0.9)',
      }}>
        {hookText.toUpperCase()}
      </div>

      {/* Accent divider */}
      <div style={{
        position:   'absolute',
        left:       '50%',
        top:        `calc(${posY} + ${hookPx * 1.2}px)`,
        transform:  'translateX(-50%)',
        width:      40,
        height:     2,
        borderRadius: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
      }} />

      {/* CTA */}
      {design.showCTA && (
        <div style={{
          position:      'absolute',
          left:          0, right: 0,
          top:           `calc(${posY} + ${hookPx * 1.2 + 8}px)`,
          textAlign:     'center',
          fontFamily:    '"DM Sans", sans-serif',
          fontSize:      Math.round(basePx * 0.9),
          fontWeight:    500,
          color:         'rgba(255,255,255,0.72)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          Read Description
        </div>
      )}

      {/* Handle + logo */}
      {(design.handle || design.logoUrl) && (
        <div style={{
          position:   'absolute',
          bottom:     8,
          left:       8,
          display:    'flex',
          alignItems: 'center',
          gap:        6,
        }}>
          {design.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={design.logoUrl}
              alt="logo"
              style={{
                width:        Math.round((design.handleSize ?? 1) * 20),
                height:       Math.round((design.handleSize ?? 1) * 20),
                borderRadius: '50%',
                objectFit:    'cover',
                border:       `1.5px solid ${accentColor}`,
                flexShrink:   0,
              }}
            />
          )}
          {design.handle && (
            <span style={{
              fontFamily:    '"DM Sans", sans-serif',
              fontSize:      Math.round(basePx * 0.75),
              fontWeight:    700,
              color:         design.paletteColors?.secondary ?? '#FFFFFF',
              textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
              letterSpacing: '0.03em',
            }}>
              {design.handle.startsWith('@') ? design.handle : `@${design.handle}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecordPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);

  const [job,      setJob]      = useState<JobInfo | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [phase,    setPhase]    = useState<'loading' | 'ready' | 'recording' | 'uploading' | 'done'>('loading');
  const [progress, setProgress] = useState(0); // 0–100 during recording

  const videoRef    = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  // ── Load job data ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [mRes, rRes] = await Promise.all([
          fetch(`/api/m/${jobId}`),
          fetch(`/api/record-data/${jobId}`),
        ]);
        const [mData, rData] = await Promise.all([mRes.json(), rRes.json()]);
        if (mData.error) throw new Error(mData.error);
        if (rData.error) throw new Error(rData.error);

        setJob({
          videoUrl:    rData.rawVideoUrl,
          hookText:    rData.hookText,
          captionText: mData.captionText ?? '',
          hashtags:    mData.hashtags ?? [],
          design:      rData.design,
          duration:    rData.duration,
        });
        setPhase('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load job');
      }
    }
    load();
  }, [jobId]);

  // ── Record ───────────────────────────────────────────────────────────────────
  async function startRecording() {
    if (!job || !videoRef.current || !containerRef.current) return;

    // canvas.captureStream() is not supported on iOS Safari
    const testCanvas = document.createElement('canvas');
    if (typeof (testCanvas as HTMLCanvasElement & { captureStream?: () => MediaStream }).captureStream !== 'function') {
      setError('Browser recording is not supported on this device. Please open this page on a desktop browser (Chrome or Firefox).');
      return;
    }

    setPhase('recording');
    setProgress(0);
    chunksRef.current = [];

    const video = videoRef.current;

    // Capture the container element's stream
    // captureStream() on the video gives us the video track;
    // we composite it with the overlay using a hidden canvas.
    const canvas  = document.createElement('canvas');
    canvas.width  = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d')!;

    // Draw loop — composites video frame + overlay onto canvas
    let animId: number;
    const palette     = job.design.paletteColors ?? PALETTE_HEX[job.design.palette] ?? PALETTE_HEX['neon-yellow'];
    const accentColor = job.design.paletteColors?.primary ?? (palette as { primary: string }).primary;
    const glowColor   = job.design.paletteColors?.accent  ?? (PALETTE_HEX[job.design.palette] ?? PALETTE_HEX['neon-yellow']).glow;
    const fontFamily  = FONT_FAMILY[job.design.font ?? 'bebas'] ?? FONT_FAMILY.bebas;
    const posYFrac    = job.design.textPosition === 'top' ? 0.22 : job.design.textPosition === 'bottom' ? 0.72 : 0.38;
    const hookFontPx  = Math.round((job.design.hookFontSize ?? 2.5) * 40);
    const baseFontPx  = Math.round((job.design.baseFontSize ?? 1.0) * 40);

    function drawFrame() {
      // Video frame
      ctx.drawImage(video, 0, 0, 1080, 1920);

      // Scrim
      const scrimTop  = 1920 * (posYFrac - 0.18);
      const scrimH    = 1920 * 0.44;
      const scrimGrad = ctx.createLinearGradient(0, scrimTop, 0, scrimTop + scrimH);
      scrimGrad.addColorStop(0,    'rgba(0,0,0,0)');
      scrimGrad.addColorStop(0.3,  'rgba(0,0,0,0.65)');
      scrimGrad.addColorStop(0.5,  'rgba(0,0,0,0.72)');
      scrimGrad.addColorStop(0.7,  'rgba(0,0,0,0.65)');
      scrimGrad.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = scrimGrad;
      ctx.fillRect(0, scrimTop, 1080, scrimH);

      // Hook text
      ctx.font         = `900 ${hookFontPx}px ${fontFamily}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = accentColor;
      ctx.shadowColor  = glowColor;
      ctx.shadowBlur   = 30;
      const hookY = 1920 * posYFrac;
      const hookText = job!.hookText.toUpperCase();

      // Natural wrap at safe zone (1080 - 128px padding each side)
      const maxW = 1080 - 128;
      const lines = wrapText(ctx, hookText, maxW);
      const lineH = hookFontPx * 1.1;
      const totalH = lines.length * lineH;
      lines.forEach((line, i) => {
        const y = hookY - totalH / 2 + i * lineH + lineH / 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.95)';
        ctx.lineWidth   = 8;
        ctx.lineJoin    = 'round';
        ctx.strokeText(line, 540, y);
        ctx.fillStyle   = accentColor;
        ctx.fillText(line, 540, y);
      });
      ctx.shadowBlur = 0;

      // Accent divider
      const divY    = hookY + totalH / 2 + 20;
      const divGrad = ctx.createLinearGradient(540 - 80, divY, 540 + 80, divY);
      divGrad.addColorStop(0,   'rgba(255,255,255,0)');
      divGrad.addColorStop(0.5, accentColor);
      divGrad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.strokeStyle = divGrad;
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(540 - 80, divY); ctx.lineTo(540 + 80, divY); ctx.stroke();

      // CTA
      if (job!.design.showCTA) {
        const ctaY = divY + 28;
        ctx.font         = `500 ${Math.round(baseFontPx * 0.95)}px "DM Sans", sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = 'rgba(0,0,0,0.7)';
        ctx.lineWidth    = 2;
        ctx.strokeText('Read Description', 540, ctaY);
        ctx.fillStyle    = 'rgba(255,255,255,0.72)';
        ctx.fillText('Read Description', 540, ctaY);
      }

      // Handle
      if (job!.design.handle) {
        const handleSize = Math.round((job!.design.handleSize ?? 1) * baseFontPx * 0.8);
        ctx.font         = `700 ${handleSize}px "DM Sans", sans-serif`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = job!.design.paletteColors?.secondary ?? '#FFFFFF';
        ctx.shadowColor  = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur   = 8;
        const h = job!.design.handle.startsWith('@') ? job!.design.handle : `@${job!.design.handle}`;
        ctx.fillText(h, 48, 1920 - 60);
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(drawFrame);
    }

    // Start video, then start recording
    video.currentTime = 0;
    await video.play();
    animId = requestAnimationFrame(drawFrame);

    const stream   = canvas.captureStream(30);
    // Prefer H.264 codec (works on iOS Safari for playback even in webm container).
    // Fall back through options to whatever the browser supports.
    const MIME_CANDIDATES = [
      'video/mp4;codecs=avc1',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = async () => {
      cancelAnimationFrame(animId);
      video.pause();

      const blob = new Blob(chunksRef.current, { type: mimeType });
      setPhase('uploading');

      // Determine extension: mp4 if H.264 in mp4 container, otherwise webm
      const blobExt = mimeType.includes('mp4') ? 'mp4' : 'webm';

      const fd = new FormData();
      fd.append('jobId', jobId);
      fd.append('video', blob, `reel.${blobExt}`);

      try {
        const res = await fetch('/api/render/browser-complete', { method: 'POST', body: fd });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? 'Upload failed');
        }
        setPhase('done');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setPhase('ready');
      }
    };

    recorder.start(100); // collect chunks every 100ms

    // Progress ticker
    const duration   = job.duration * 1000;
    const startedAt  = Date.now();
    const ticker = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - startedAt) / duration) * 100));
      setProgress(pct);
      if (pct >= 100) clearInterval(ticker);
    }, 200);

    // Stop after clip duration
    setTimeout(() => {
      clearInterval(ticker);
      setProgress(100);
      recorder.stop();
    }, duration);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <p className="text-red-400 font-mono text-sm">{error}</p>
      </main>
    );
  }

  if (phase === 'loading' || !job) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-[#5A6478] font-mono text-sm">
          <SpinnerIcon />
          Loading…
        </div>
      </main>
    );
  }

  if (phase === 'done') {
    return (
      <main className="min-h-screen bg-[#07080A] flex flex-col items-center justify-center gap-6 p-6">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#E8FF47]" />
          <span className="text-[#E8FF47] font-mono text-sm uppercase tracking-widest">Reel ready</span>
        </div>
        <p className="text-[#5A6478] text-sm text-center max-w-xs">
          Your reel has been saved. Go back to the home page to get your QR code and download link.
        </p>
        <a
          href={`/?done=${jobId}`}
          className="px-6 py-3 bg-[#E8FF47] text-[#07080A] font-bold font-mono text-sm rounded hover:bg-[#F2FF70] transition-colors uppercase tracking-wide"
        >
          View QR Code →
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07080A] flex flex-col items-center gap-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 border border-[#E8FF47] rounded-sm flex items-center justify-center">
          <span className="text-[#E8FF47] text-[8px] font-mono font-bold">R</span>
        </div>
        <span className="text-[#EEF2F7] text-sm font-bold font-mono tracking-tight">Reelator</span>
        <span className="text-[#353D4A] font-mono text-xs ml-2">Browser Render</span>
      </div>

      {/* Preview */}
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden border border-[#1E2329]"
        style={{ width: 'min(300px, 85vw)', aspectRatio: '9/16', background: '#000' }}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={job.videoUrl}
          muted
          playsInline
          loop={false}
          className="w-full h-full object-cover"
          style={{ display: 'block' }}
        />
        <HookOverlay hookText={job.hookText} design={job.design} />

        {/* Recording indicator */}
        {phase === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-mono text-[10px]">REC {progress}%</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {phase === 'recording' && (
        <div className="w-full max-w-xs h-1 bg-[#1E2329] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E8FF47] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        {phase === 'ready' && (
          <button
            onClick={startRecording}
            className="w-full py-3.5 bg-[#E8FF47] text-[#07080A] font-bold font-mono text-sm rounded-lg hover:bg-[#F2FF70] active:scale-[0.98] transition-all uppercase tracking-wide"
          >
            Record Reel ({job.duration}s)
          </button>
        )}
        {phase === 'recording' && (
          <div className="w-full py-3.5 bg-[#0D0F12] text-[#5A6478] font-mono text-sm rounded-lg border border-[#1E2329] text-center uppercase tracking-wide">
            Recording… {progress}%
          </div>
        )}
        {phase === 'uploading' && (
          <div className="w-full py-3.5 bg-[#0D0F12] text-[#5A6478] font-mono text-sm rounded-lg border border-[#1E2329] text-center uppercase tracking-wide flex items-center justify-center gap-2">
            <SpinnerIcon /> Saving reel…
          </div>
        )}
        <p className="text-[10px] font-mono text-[#353D4A] text-center">
          Keep this tab open while recording. The video plays for {job.duration}s then saves automatically.
        </p>
      </div>
    </main>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
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

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}
