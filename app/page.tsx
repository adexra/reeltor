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

      {/* Sidebar */}
      <div className="relative border-r border-[#1E2329]">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8FF4740] to-transparent" />
        <ContextSidebar onChange={setContext} />
      </div>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top nav */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b border-[#1E2329] bg-[#07080A]/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border border-[#E8FF47] rounded-sm flex items-center justify-center">
              <span className="text-[#E8FF47] text-[10px] font-mono font-bold">R</span>
            </div>
            <span
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
              className="text-sm font-bold text-[#EEF2F7]"
            >
              Reelator
            </span>
          </div>

          <div className="flex items-center gap-4">
            {generationResult && !renderDone && (
              <button
                onClick={handleReset}
                className="text-[10px] font-mono text-[#353D4A] hover:text-[#5A6478] transition-colors uppercase tracking-widest"
              >
                ← New Reel
              </button>
            )}
            <div className="flex items-center gap-1 text-[10px] font-mono text-[#353D4A] uppercase tracking-widest">
              <span className="w-1 h-1 rounded-full bg-[#E8FF47] opacity-70" />
              <span>Ready</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-10">
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
