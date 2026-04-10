'use client';

/**
 * app/m/[jobId]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Mobile handoff page — opened on phone via QR code scan from desktop.
 *
 * Flow: Desktop user finishes reel → sees QR code → scans it on phone →
 * lands here → watches preview → copies caption → downloads video → posts.
 */

import { useEffect, useState, use } from 'react';

interface JobData {
  videoUrl:    string | null;
  captionText: string | null;
  hashtags:    string[];
  status:      string;
}

export default function MobileHandoff({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId }       = use(params);
  const [data, setData] = useState<JobData | null>(null);
  const [copied,        setCopied]        = useState(false);
  const [captionOpen,   setCaptionOpen]   = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/m/${jobId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(() => setError('Failed to load reel data.'));
  }, [jobId]);

  const captionFull = data
    ? [data.captionText, '', ...(data.hashtags ?? [])].filter(Boolean).join('\n')
    : '';

  const handleCopy = async () => {
    if (!captionFull) return;
    try {
      await navigator.clipboard.writeText(captionFull);
      setCopied(true);
      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers that block clipboard without interaction
      const ta = document.createElement('textarea');
      ta.value = captionFull;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (!data && !error) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin text-[#E8FF47]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span className="text-[#5A6478] font-mono text-sm">Loading your reel…</span>
        </div>
      </main>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 max-w-xs text-center">
          <span className="text-2xl">⚠️</span>
          <p className="text-red-400 font-mono text-sm">{error}</p>
        </div>
      </main>
    );
  }

  // ── Still rendering ──────────────────────────────────────────────────────────
  if (data!.status !== 'done' || !data!.videoUrl) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 max-w-xs text-center">
          {data!.status === 'error' ? (
            <>
              <span className="text-2xl">❌</span>
              <p className="text-red-400 font-mono text-sm">Render failed. Go back to desktop and retry.</p>
            </>
          ) : (
            <>
              <svg className="animate-spin text-[#E8FF47]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <p className="text-[#5A6478] font-mono text-sm">Still rendering — check back in a moment.</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 px-5 py-3 border border-[#1E2329] text-[#5A6478] font-mono text-sm rounded-lg hover:border-[#2A3140] hover:text-[#EEF2F7] transition-colors touch-manipulation"
              >
                Refresh
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#07080A] flex flex-col items-center gap-0 pb-10">

      {/* Top bar */}
      <div className="w-full flex items-center justify-between px-5 py-4 border-b border-[#1E2329]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border border-[#E8FF47] rounded-sm flex items-center justify-center">
            <span className="text-[#E8FF47] text-[8px] font-mono font-bold">R</span>
          </div>
          <span className="text-[#EEF2F7] text-sm font-bold font-mono tracking-tight">Reelator</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF47]" />
          <span className="text-[#E8FF47] font-mono text-[10px] uppercase tracking-widest">Reel ready</span>
        </div>
      </div>

      {/* Steps guide */}
      <div className="w-full px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <StepPill n={1} label="Watch" />
          <div className="flex-1 h-px bg-[#1E2329]" />
          <StepPill n={2} label="Copy" />
          <div className="flex-1 h-px bg-[#1E2329]" />
          <StepPill n={3} label="Download" />
          <div className="flex-1 h-px bg-[#1E2329]" />
          <StepPill n={4} label="Post" />
        </div>
      </div>

      {/* Video player */}
      <div className="w-full px-5 mt-2">
        <div className="w-full rounded-2xl overflow-hidden border border-[#1E2329] bg-black" style={{ aspectRatio: '9/16', maxHeight: '55vh' }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={`/api/library/${jobId}/stream`}
            controls
            playsInline
            autoPlay={false}
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Caption block */}
      {data!.captionText && (
        <div className="w-full px-5 mt-5">
          <div className="rounded-xl border border-[#1E2329] bg-[#0D0F12] overflow-hidden">
            {/* Header row */}
            <button
              type="button"
              onClick={() => setCaptionOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-4 touch-manipulation"
            >
              <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">Caption + Hashtags</span>
              <span className="text-[#5A6478] font-mono text-xs">{captionOpen ? '↑ Hide' : '↓ Read'}</span>
            </button>

            {/* Preview (always visible) */}
            <div className="px-4 pb-3">
              <p className={`text-[#9AA3B0] text-sm leading-relaxed whitespace-pre-line ${captionOpen ? '' : 'line-clamp-3'}`}>
                {captionFull}
              </p>
            </div>

            {/* Hashtags chips */}
            {data!.hashtags.length > 0 && captionOpen && (
              <div className="px-4 pb-4 flex flex-wrap gap-1.5">
                {data!.hashtags.map((tag) => (
                  <span key={tag} className="text-[11px] font-mono text-[#5A6478] border border-[#1E2329] px-2.5 py-1 rounded-full bg-[#07080A]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="w-full px-5 mt-5 flex flex-col gap-3">

        {/* Copy — primary action */}
        <button
          onClick={handleCopy}
          className={`w-full py-4 rounded-xl font-bold font-mono text-sm uppercase tracking-wide touch-manipulation transition-all active:scale-[0.97] ${
            copied
              ? 'bg-[#39FF14] text-[#07080A]'
              : 'bg-[#E8FF47] text-[#07080A] hover:bg-[#F2FF70]'
          }`}
        >
          {copied ? '✓ Copied to clipboard!' : '⎘  Copy Caption + Hashtags'}
        </button>

        {/* Download — secondary action */}
        <a
          href={`/api/library/${jobId}/download`}
          download={`reel_${jobId}.webm`}
          className="w-full py-4 rounded-xl border border-[#E8FF4740] text-[#E8FF47] font-bold font-mono text-sm uppercase tracking-wide text-center touch-manipulation transition-all active:scale-[0.97] hover:bg-[#E8FF4708]"
        >
          ↓  Download Video
        </a>

        {/* Post reminder */}
        <div className="mt-1 px-4 py-3 rounded-xl border border-[#1E2329] bg-[#0D0F12]">
          <p className="text-[#353D4A] text-[11px] font-mono text-center leading-relaxed">
            Post order: open Instagram → create Reel → upload video → paste caption → post
          </p>
        </div>
      </div>

    </main>
  );
}

function StepPill({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-6 h-6 rounded-full border border-[#E8FF4740] bg-[#E8FF4710] flex items-center justify-center">
        <span className="text-[#E8FF47] text-[10px] font-mono font-bold">{n}</span>
      </div>
      <span className="text-[#353D4A] text-[9px] font-mono uppercase tracking-wide">{label}</span>
    </div>
  );
}
