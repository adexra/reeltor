'use client';

/**
 * app/m/[jobId]/page.tsx
 * Mobile handoff page — opened on phone via QR code scan.
 * Shows the rendered video, a copy-caption button, and a download button.
 */

import { useEffect, useState, use } from 'react';

interface JobData {
  videoUrl:    string | null;
  captionText: string | null;
  hashtags:    string[];
  status:      string;
}

export default function MobileHandoff({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId }     = use(params);
  const [data, setData] = useState<JobData | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/m/${jobId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(() => setError('Failed to load reel data.'));
  }, [jobId]);

  const handleCopy = async () => {
    if (!data) return;
    const text = [data.captionText, '', ...(data.hashtags ?? [])].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <p className="text-red-400 font-mono text-sm">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-[#5A6478] font-mono text-sm">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Loading…
        </div>
      </main>
    );
  }

  if (data.status !== 'done' || !data.videoUrl) {
    return (
      <main className="min-h-screen bg-[#07080A] flex items-center justify-center p-6">
        <p className="text-[#5A6478] font-mono text-sm">
          {data.status === 'error' ? 'Render failed.' : 'Reel is still rendering — check back shortly.'}
        </p>
      </main>
    );
  }

  const captionFull = [data.captionText, '', ...(data.hashtags ?? [])].filter(Boolean).join('\n');

  return (
    <main className="min-h-screen bg-[#07080A] flex flex-col items-center gap-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 border border-[#E8FF47] rounded-sm flex items-center justify-center">
          <span className="text-[#E8FF47] text-[8px] font-mono font-bold">R</span>
        </div>
        <span className="text-[#EEF2F7] text-sm font-bold font-mono tracking-tight">Reelator</span>
      </div>

      {/* Video */}
      <div className="w-full max-w-xs rounded-2xl overflow-hidden border border-[#1E2329]">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={data.videoUrl}
          controls
          playsInline
          className="w-full"
          style={{ aspectRatio: '9/16', objectFit: 'cover', background: '#000' }}
        />
      </div>

      {/* Caption preview */}
      {data.captionText && (
        <div className="w-full max-w-xs bg-[#0D0F12] border border-[#1E2329] rounded-xl p-4">
          <p className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em] mb-2">Caption</p>
          <p className="text-[#9AA3B0] text-sm leading-relaxed whitespace-pre-line line-clamp-4">
            {captionFull}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={handleCopy}
          className="w-full py-3.5 bg-[#E8FF47] text-[#07080A] font-bold font-mono text-sm rounded-lg hover:bg-[#F2FF70] active:scale-[0.98] transition-all uppercase tracking-wide"
        >
          {copied ? '✓ Copied!' : 'Copy Caption + Hashtags'}
        </button>
        <a
          href={`/api/library/${jobId}/download`}
          download="reel.mp4"
          className="w-full py-3.5 border border-[#1E2329] text-[#5A6478] font-mono text-sm rounded-lg hover:border-[#2A3140] hover:text-[#EEF2F7] transition-colors text-center uppercase tracking-wide"
        >
          Download Video
        </a>
      </div>
    </main>
  );
}
