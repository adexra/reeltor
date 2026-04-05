'use client';

import { useState, useEffect, useRef } from 'react';
import type { GenerationResult, HookOption, CaptionOption, RenderResult, DesignConfig } from '../schema';
import { DesignEditor, DEFAULT_DESIGN } from './DesignEditor';
import { DesignStudio, DESIGN_STUDIO_DEFAULTS } from './DesignStudio';

// ── Stages ────────────────────────────────────────────────────────────────────

type Stage = 'hook' | 'caption' | 'brand' | 'design';

export function SelectionPanel({ result, onRenderComplete }: {
  result: GenerationResult;
  onRenderComplete: (jobId: string) => void;
}) {
  const [stage,        setStage]        = useState<Stage>('hook');
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [design,       setDesign]       = useState<DesignConfig>({
    ...DEFAULT_DESIGN,
    ...DESIGN_STUDIO_DEFAULTS,
  });

  function handleHookConfirmed(_hookId: string, _hookText: string, rr: RenderResult) {
    setRenderResult(rr);
    setStage('caption');
  }

  function handleCaptionConfirmed(rr: RenderResult) {
    setRenderResult(rr);
    setStage('brand');
  }

  function handleBrandConfirmed(updatedDesign: DesignConfig) {
    setDesign(updatedDesign);
    setStage('design');
  }

  if (stage === 'design' && renderResult) {
    return (
      <RenderStage
        renderResult={renderResult}
        design={design}
        onDesignChange={setDesign}
        onRenderComplete={onRenderComplete}
        onBack={() => setStage('brand')}
      />
    );
  }

  if (stage === 'brand' && renderResult) {
    return (
      <BrandStage
        renderResult={renderResult}
        design={design}
        onConfirmed={handleBrandConfirmed}
        onBack={() => setStage('caption')}
      />
    );
  }

  if (stage === 'caption' && renderResult) {
    return (
      <CaptionStage
        renderResult={renderResult}
        onCaptionConfirmed={handleCaptionConfirmed}
        onBack={() => setStage('hook')}
      />
    );
  }

  return (
    <HookStage
      result={result}
      onHookConfirmed={handleHookConfirmed}
    />
  );
}

// ── Hook Stage — Step 1 ───────────────────────────────────────────────────────

interface HookStageProps {
  result: GenerationResult;
  onHookConfirmed: (hookId: string, hookText: string, renderResult: RenderResult) => void;
}

function HookStage({ result, onHookConfirmed }: HookStageProps) {
  const [selectedHookId, setSelectedHookId] = useState(result.selectedHookId);
  const [isLoading,      setIsLoading]      = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const selectedHook = result.hooks.find((h) => h.id === selectedHookId) ?? result.hooks[0];

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/render', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phase:            'captions',
          jobId:            result.jobId,
          selectedHookId:   selectedHook.id,
          selectedHookText: selectedHook.text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      onHookConfirmed(selectedHook.id, selectedHook.text, data.renderResult as RenderResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate captions');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl w-full">
      <div>
        <StepLabel step={1} total={4} color="#E8FF47" />
        <h2 className="text-2xl font-extrabold text-[#EEF2F7] leading-none" style={{ letterSpacing: '-0.03em' }}>
          Choose Your Hook
        </h2>
        <p className="text-[#5A6478] text-sm mt-2">
          Pick the hook that will appear on your reel. Captions are written for the hook you choose.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        {result.hooks.map((hook) => (
          <HookCard
            key={hook.id}
            hook={hook}
            selected={selectedHookId === hook.id}
            onSelect={() => setSelectedHookId(hook.id)}
          />
        ))}
      </section>

      {error && <ErrorBox message={error} />}

      <button
        onClick={handleConfirm}
        disabled={isLoading}
        className={`w-full py-3.5 rounded font-mono text-sm tracking-[0.08em] uppercase transition-all duration-200
          ${isLoading
            ? 'bg-[#0D0F12] text-[#353D4A] border border-[#1E2329] cursor-not-allowed'
            : 'bg-[#E8FF47] text-[#07080A] font-bold hover:bg-[#F2FF70] active:scale-[0.99]'
          }`}
      >
        {isLoading ? <LoadingLabel label="Writing captions for this hook…" /> : 'Use this hook → write captions'}
      </button>
    </div>
  );
}

// ── Caption Stage — Step 2 ────────────────────────────────────────────────────

function CaptionStage({
  renderResult,
  onCaptionConfirmed,
  onBack,
}: {
  renderResult: RenderResult;
  onCaptionConfirmed: (rr: RenderResult) => void;
  onBack: () => void;
}) {
  const [selectedCaptionId, setSelectedCaptionId] = useState(renderResult.selectedCaptionId);
  const [expandedCaption,   setExpandedCaption]   = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8 max-w-2xl w-full">
      <div>
        <StepLabel step={2} total={4} color="#3B82F6" />
        <h2 className="text-2xl font-extrabold text-[#EEF2F7] leading-none" style={{ letterSpacing: '-0.03em' }}>
          Choose Your Caption
        </h2>
        <p className="text-[#5A6478] text-sm mt-2">
          Written specifically for:{' '}
          <span className="text-[#EEF2F7] font-mono">"{renderResult.selectedHookText}"</span>
        </p>
      </div>

      <section className="flex flex-col gap-3">
        {renderResult.captions.map((caption) => (
          <CaptionCard
            key={caption.id}
            caption={caption}
            selected={selectedCaptionId === caption.id}
            expanded={expandedCaption === caption.id}
            onSelect={() => setSelectedCaptionId(caption.id)}
            onToggleExpand={() =>
              setExpandedCaption((prev) => (prev === caption.id ? null : caption.id))
            }
          />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Hashtags</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {renderResult.hashtags.map((tag) => (
            <span key={tag} className="text-xs font-mono text-[#5A6478] border border-[#1E2329] px-2.5 py-1 rounded bg-[#0D0F12]">
              {tag}
            </span>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <button
          onClick={() => onCaptionConfirmed({ ...renderResult, selectedCaptionId })}
          className="flex-1 py-3.5 bg-[#E8FF47] text-[#07080A] font-bold font-mono text-sm rounded hover:bg-[#F2FF70] active:scale-[0.99] transition-all uppercase tracking-[0.08em]"
        >
          Brand Your Reel →
        </button>
      </div>
    </div>
  );
}

// ── Brand Stage — Step 3 (NEW) ────────────────────────────────────────────────

function BrandStage({
  renderResult,
  design,
  onConfirmed,
  onBack,
}: {
  renderResult: RenderResult;
  design: DesignConfig;
  onConfirmed: (design: DesignConfig) => void;
  onBack: () => void;
}) {
  const [localDesign, setLocalDesign] = useState<DesignConfig>(design);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl">
      <div>
        <StepLabel step={3} total={4} color="#39FF14" />
        <h2 className="text-2xl font-extrabold text-[#EEF2F7] leading-none" style={{ letterSpacing: '-0.03em' }}>
          Brand Your Reel
        </h2>
        <p className="text-[#5A6478] text-sm mt-2">
          Add your handle, logo, choose a colour theme and set font sizes.
        </p>
      </div>

      <DesignStudio
        value={localDesign}
        onChange={setLocalDesign}
        hookText={renderResult.selectedHookText}
      />

      <div className="flex gap-3 max-w-sm">
        <BackButton onClick={onBack} />
        <button
          onClick={() => onConfirmed(localDesign)}
          className="flex-1 py-3 bg-[#E8FF47] text-[#07080A] font-bold font-mono text-sm rounded hover:bg-[#F2FF70] transition-colors uppercase tracking-wide"
        >
          Style the Design →
        </button>
      </div>
    </div>
  );
}

// ── Render Stage — Step 4 (was Step 3) ────────────────────────────────────────

function RenderStage({
  renderResult,
  design,
  onDesignChange,
  onRenderComplete,
  onBack,
}: {
  renderResult: RenderResult;
  design: DesignConfig;
  onDesignChange: (d: DesignConfig) => void;
  onRenderComplete: (jobId: string) => void;
  onBack: () => void;
}) {
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [statusMsg,   setStatusMsg]   = useState('Dispatching to Azure render server…');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll /api/render/status/:jobId every 5s until done or error
  const startPolling = (jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/render/status/${jobId}`);
        const d = await r.json() as { status: string; progress: number; errorMessage?: string };

        if (d.status === 'done') {
          clearInterval(pollRef.current!);
          onRenderComplete(jobId);
        } else if (d.status === 'error') {
          clearInterval(pollRef.current!);
          setRenderError(d.errorMessage ?? 'Render failed on Azure.');
          setIsRendering(false);
        } else {
          const pct = d.progress ?? 0;
          setStatusMsg(`Rendering on Azure… ${pct}%`);
        }
      } catch {
        // Network blip — keep polling
      }
    }, 5000);
  };

  // Clean up on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleConfirm = async (finalDesign: DesignConfig) => {
    onDesignChange(finalDesign);
    setIsRendering(true);
    setRenderError(null);
    setStatusMsg('Dispatching to Azure render server…');
    try {
      const res = await fetch('/api/render', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phase:             'render',
          jobId:             renderResult.jobId,
          selectedHookText:  renderResult.selectedHookText,
          selectedHookId:    'confirmed',
          selectedCaptionId: renderResult.selectedCaptionId,
          design:            finalDesign,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Render failed (${res.status})`);
      // 202 accepted — start polling for completion
      setStatusMsg('Render queued. Waiting for Azure…');
      startPolling(renderResult.jobId);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Render failed');
      setIsRendering(false);
    }
  };

  if (isRendering) {
    return (
      <div className="flex flex-col items-start gap-6 max-w-md">
        <div className="flex items-center gap-3">
          <SpinnerIcon />
          <span className="text-[#E8FF47] font-mono text-sm uppercase tracking-widest">Rendering reel…</span>
        </div>
        <p className="text-[#5A6478] text-sm">{statusMsg}</p>
      </div>
    );
  }

  return (
    <>
      {renderError && <ErrorBox message={renderError} />}
      <DesignEditor
        renderResult={{ ...renderResult, design }}
        onConfirm={handleConfirm}
        onBack={onBack}
      />
    </>
  );
}

// ── Hook Card ─────────────────────────────────────────────────────────────────

function HookCard({ hook, selected, onSelect }: { hook: HookOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded border transition-all duration-150 ${
        selected
          ? 'border-[#E8FF47] bg-[#E8FF4708] shadow-[0_0_0_1px_#E8FF4720]'
          : 'border-[#1E2329] hover:border-[#2A3140] bg-[#0D0F12]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          selected ? 'border-[#E8FF47] bg-[#E8FF47]' : 'border-[#2A3140]'
        }`}>
          {selected && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4L3 5.5L6.5 2" stroke="#07080A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <span className="text-base text-[#EEF2F7] font-medium leading-tight font-mono">{hook.text}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={hook.score >= 7 ? 'green' : hook.score >= 5 ? 'amber' : 'red'}>Score {hook.score}/10</Badge>
            <Badge variant={hook.spellingOk ? 'green' : 'amber'}>{hook.spellingOk ? '✓ Spelling' : '⚠ Corrected'}</Badge>
            <Badge variant="neutral">{hook.wordCount}w</Badge>
            {hook.isRecommended && <Badge variant="yellow">Recommended</Badge>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Caption Card ──────────────────────────────────────────────────────────────

function CaptionCard({
  caption, selected, expanded, onSelect, onToggleExpand,
}: {
  caption: CaptionOption;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className={`rounded border transition-all duration-150 ${
      selected ? 'border-[#3B82F6] bg-[#3B82F608] shadow-[0_0_0_1px_#3B82F620]' : 'border-[#1E2329] bg-[#0D0F12]'
    }`}>
      <button type="button" onClick={onSelect} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            selected ? 'border-[#3B82F6] bg-[#3B82F6]' : 'border-[#2A3140]'
          }`}>
            {selected && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <p className={`text-sm text-[#9AA3B0] leading-relaxed whitespace-pre-line ${!expanded ? 'line-clamp-3' : ''}`}>
              {caption.text}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {caption.format && <Badge variant="neutral">Format {caption.format}</Badge>}
              <Badge variant={caption.score >= 7 ? 'green' : caption.score >= 5 ? 'amber' : 'red'}>Score {caption.score}/10</Badge>
              {caption.skillScore > 0 && (
                <Badge variant={caption.skillScore >= 7 ? 'green' : 'amber'}>Skill {caption.skillScore}/10</Badge>
              )}
              <Badge variant={caption.hasCTA ? 'green' : 'amber'}>{caption.hasCTA ? '✓ CTA' : 'No CTA'}</Badge>
              <Badge variant={caption.firstLineStrong ? 'green' : 'amber'}>{caption.firstLineStrong ? '✓ First line' : '△ First line'}</Badge>
              {!caption.noMarkdown && <Badge variant="red">⚠ Markdown</Badge>}
              {!caption.noForbiddenPhrases && <Badge variant="red">⚠ Phrases</Badge>}
              {caption.isRecommended && <Badge variant="blue">Recommended</Badge>}
            </div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full px-4 pb-3 text-left text-[10px] font-mono text-[#353D4A] hover:text-[#5A6478] transition-colors uppercase tracking-widest"
      >
        {expanded ? '↑ Collapse' : '↓ Read full caption'}
      </button>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function StepLabel({ step, total, color }: { step: number; total: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color }}>
        Step {step} of {total}
      </span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-3 border border-[#1E2329] text-[#5A6478] font-mono text-sm rounded hover:border-[#2A3140] hover:text-[#EEF2F7] transition-colors uppercase tracking-wide"
    >
      ← Back
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="text-xs text-red-400 font-mono border border-red-900/40 bg-red-950/20 px-3 py-2 rounded">
      {message}
    </p>
  );
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <SpinnerIcon />
      {label}
    </span>
  );
}

type BadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'yellow' | 'neutral';

const BADGE_STYLES: Record<BadgeVariant, string> = {
  green:   'bg-emerald-950/50 text-emerald-400 border-emerald-900/50',
  amber:   'bg-amber-950/50  text-amber-400  border-amber-900/50',
  red:     'bg-red-950/50    text-red-400    border-red-900/50',
  blue:    'bg-blue-950/50   text-blue-400   border-blue-900/50',
  yellow:  'bg-yellow-950/50 text-yellow-300 border-yellow-900/50',
  neutral: 'bg-[#0D0F12]     text-[#5A6478]  border-[#1E2329]',
};

function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${BADGE_STYLES[variant]}`}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">{children}</span>;
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}
