'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ContextSidebar } from '../components/ContextSidebar';
import { GeneratorPanel } from '../components/GeneratorPanel';
import { SelectionPanel } from '../components/SelectionPanel';
import type { BusinessContext, GenerationResult } from '../schema';

const defaultContext: BusinessContext = {
  businessName: '',
  targetAudience: '',
  tone: 'Inspirational',
  productDescription: '',
};

export default function HomePage() {
  const [context,          setContext]          = useState<BusinessContext>(defaultContext);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [doneJobId,        setDoneJobId]        = useState<string | null>(() => {
    // Browser recorder redirects back with ?done=jobId
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('done');
  });
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [touchStartX,      setTouchStartX]      = useState<number | null>(null);

  // Mobile swipe to open/close sidebar
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - touchStartX;

    // Swipe right to open sidebar (from left edge)
    if (deltaX > 50 && touchStartX < 50 && !sidebarOpen) {
      setSidebarOpen(true);
    }
    // Swipe left to close sidebar
    else if (deltaX < -50 && sidebarOpen) {
      setSidebarOpen(false);
    }

    setTouchStartX(null);
  };

  function handlePhase1Complete(result: GenerationResult) {
    setGenerationResult(result);
    // Mobile haptic feedback simulation
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  function handleRenderComplete(jobId: string) {
    setDoneJobId(jobId);
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  }

  function handleReset() {
    setGenerationResult(null);
    setDoneJobId(null);
  }

  return (
    <div
      className="flex h-screen overflow-hidden bg-[#07080A]"
      suppressHydrationWarning
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 md:z-auto
        w-80 md:w-auto h-full
        transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        transition-transform duration-300 ease-in-out
        border-r border-[#1E2329] bg-[#07080A]
      `}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8FF4740] to-transparent" />
        <ContextSidebar onChange={setContext} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Top nav */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 border-b border-[#1E2329] bg-[#07080A]/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-[#5A6478] hover:text-[#EEF2F7] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            <div className="w-5 h-5 md:w-6 md:h-6 border border-[#E8FF47] rounded-sm flex items-center justify-center">
              <span className="text-[#E8FF47] text-[8px] md:text-[10px] font-mono font-bold">R</span>
            </div>
            <span
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
              className="text-xs md:text-sm font-bold text-[#EEF2F7]"
            >
              Reelator
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {generationResult && !doneJobId && (
              <button
                onClick={handleReset}
                className="text-[9px] md:text-[10px] font-mono text-[#353D4A] hover:text-[#5A6478] transition-colors uppercase tracking-widest"
              >
                ← New
              </button>
            )}
            <div className="flex items-center gap-1 text-[9px] md:text-[10px] font-mono text-[#353D4A] uppercase tracking-widest">
              <span className="w-1 h-1 rounded-full bg-[#E8FF47] opacity-70" />
              <span className="hidden sm:inline">Ready</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 md:px-8 py-6 md:py-10">
          {!context.businessName && !generationResult && !doneJobId && (
            <div className="md:hidden mb-4 px-4 py-3 rounded border border-[#E8FF4740] bg-[#E8FF4708] flex items-center justify-between gap-3">
              <span className="text-[#E8FF47] text-xs font-mono">Set up your business context first</span>
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-[#E8FF47] text-xs font-mono underline underline-offset-2 shrink-0 touch-manipulation"
              >
                Open →
              </button>
            </div>
          )}
          {doneJobId ? (
            <RenderSuccess jobId={doneJobId} onReset={handleReset} />
          ) : generationResult ? (
            <SelectionPanel result={generationResult} onRenderComplete={handleRenderComplete} />
          ) : (
            <GeneratorPanel context={context} onPhase1Complete={handlePhase1Complete} />
          )}
        </div>
      </main>
    </div>
  );
}

function RenderSuccess({ jobId, onReset }: { jobId: string; onReset: () => void }) {
  // Build the mobile handoff URL — works on Vercel (uses window.location.origin)
  const mobileUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/m/${jobId}`
    : `/m/${jobId}`;

  return (
    <div className="flex flex-col items-center md:items-start gap-8 w-full max-w-md mx-auto">
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-[#E8FF47]" />
        <span className="text-[#E8FF47] font-mono text-sm uppercase tracking-widest">Reel rendered</span>
      </div>

      <h2
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
        className="text-2xl font-extrabold text-[#EEF2F7]"
      >
        Your reel is ready.
      </h2>

      {/* QR Code handoff */}
      <div className="flex flex-col gap-4">
        <p className="text-[#5A6478] text-sm">
          Scan with your phone to download the video and copy the caption for posting.
        </p>
        <div className="p-4 bg-white rounded-xl inline-block self-center md:self-start">
          <QRCodeSVG
            value={mobileUrl}
            size={180}
            bgColor="#ffffff"
            fgColor="#07080A"
            level="M"
          />
        </div>
        <p className="text-[10px] font-mono text-[#353D4A] break-all text-center md:text-left">{mobileUrl}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <a
          href="/library"
          className="w-full sm:w-auto text-center px-5 py-2.5 bg-[#E8FF47] text-[#07080A] font-mono text-sm font-bold rounded hover:bg-[#F2FF70] transition-colors uppercase tracking-wide touch-manipulation"
        >
          View Library
        </a>
        <button
          onClick={onReset}
          className="w-full sm:w-auto text-center px-5 py-2.5 border border-[#1E2329] text-[#5A6478] font-mono text-sm rounded hover:border-[#2A3140] hover:text-[#EEF2F7] transition-colors uppercase tracking-wide touch-manipulation"
        >
          New Reel
        </button>
      </div>
    </div>
  );
}
