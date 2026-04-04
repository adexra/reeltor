'use client';

import { useState } from 'react';
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
  const [renderDone,       setRenderDone]       = useState(false);
  const [sidebarOpen,      setSidebarOpen]      = useState(false);

  function handlePhase1Complete(result: GenerationResult) {
    setGenerationResult(result);
  }

  function handleRenderComplete(_jobId: string) {
    setRenderDone(true);
  }

  function handleReset() {
    setGenerationResult(null);
    setRenderDone(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#07080A]" suppressHydrationWarning>

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
            {generationResult && !renderDone && (
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
          {renderDone ? (
            <RenderSuccess onReset={handleReset} />
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

function RenderSuccess({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-6 max-w-md">
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
      <p className="text-[#5A6478] text-sm">
        It has been saved to your library. You can download it or generate another.
      </p>
      <div className="flex gap-3">
        <a
          href="/library"
          className="px-5 py-2.5 bg-[#E8FF47] text-[#07080A] font-mono text-sm font-bold rounded hover:bg-[#F2FF70] transition-colors uppercase tracking-wide"
        >
          View Library
        </a>
        <button
          onClick={onReset}
          className="px-5 py-2.5 border border-[#1E2329] text-[#5A6478] font-mono text-sm rounded hover:border-[#2A3140] hover:text-[#EEF2F7] transition-colors uppercase tracking-wide"
        >
          New Reel
        </button>
      </div>
    </div>
  );
}
