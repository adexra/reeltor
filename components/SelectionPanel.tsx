'use client';

import { useState } from 'react';
import type { GenerationResult, HookOption, CaptionOption, RenderResult } from '../schema';

// ── Stage 1: Hook Selection ───────────────────────────────────────────────────

interface HookStageProps {
  result: GenerationResult;
  onHookConfirmed: (hookId: string, hookText: string, renderResult: RenderResult) => void;
}

export function SelectionPanel({ result, onRenderComplete }: {
  result: GenerationResult;
  onRenderComplete: (jobId: string) => void;
}) {
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);

  function handleHookConfirmed(_hookId: string, _hookText: string, rr: RenderResult) {
    setRenderResult(rr);
  }

  if (renderResult) {
    return (
      <CaptionStage
        renderResult={renderResult}
        onRenderComplete={onRenderComplete}
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

// ── Hook Stage ────────────────────────────────────────────────────────────────

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

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF47]" />
          <span className="text-[10px] font-mono text-[#E8FF47] uppercase tracking-widest">
            Step 1 of 2
          </span>
        </div>
        <h2
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
          className="text-2xl font-extrabold text-[#EEF2F7] leading-none"
        >
          Choose Your Hook
        </h2>
        <p className="text-[#5A6478] text-sm mt-2">
          Pick the hook that will appear on your reel. Captions are written for the hook you choose.
        </p>
      </div>

      {/* Hook list */}
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

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 font-mono border border-red-900/40 bg-red-950/20 px-3 py-2 rounded">
          {error}
        </p>
      )}

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={isLoading}
        className={`w-full py-3.5 rounded font-mono text-sm tracking-[0.08em] uppercase transition-all duration-200
          ${isLoading
            ? 'bg-[#0D0F12] text-[#353D4A] border border-[#1E2329] cursor-not-allowed'
            : 'bg-[#E8FF47] text-[#07080A] font-bold hover:bg-[#F2FF70] active:scale-[0.99]'
          }`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <SpinnerIcon />
            Writing captions for this hook…
          </span>
        ) : (
          'Use this hook → write captions'
        )}
      </button>
    </div>
  );
}

// ── Caption Stage ─────────────────────────────────────────────────────────────

interface CaptionStageProps {
  renderResult: RenderResult;
  onRenderComplete: (jobId: string) => void;
}

function CaptionStage({ renderResult, onRenderComplete }: CaptionStageProps) {
  const [selectedCaptionId, setSelectedCaptionId] = useState(renderResult.selectedCaptionId);
  const [expandedCaption,   setExpandedCaption]   = useState<string | null>(null);
  const [isRendering,       setIsRendering]        = useState(false);
  const [renderError,       setRenderError]        = useState<string | null>(null);

  const handleRender = async () => {
    setIsRendering(true);
    setRenderError(null);
    try {
      const res = await fetch('/api/render', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phase:             'render',
          jobId:             renderResult.jobId,
          selectedHookText:  renderResult.selectedHookText,
          selectedHookId:    'confirmed',
          selectedCaptionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Render failed (${res.status})`);
      onRenderComplete(renderResult.jobId);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Render failed');
      setIsRendering(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl w-full">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
          <span className="text-[10px] font-mono text-[#3B82F6] uppercase tracking-widest">
            Step 2 of 2
          </span>
        </div>
        <h2
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
          className="text-2xl font-extrabold text-[#EEF2F7] leading-none"
        >
          Choose Your Caption
        </h2>
        <p className="text-[#5A6478] text-sm mt-2">
          Written specifically for:{' '}
          <span className="text-[#EEF2F7] font-mono">"{renderResult.selectedHookText}"</span>
        </p>
      </div>

      {/* Caption list */}
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

      {/* Hashtags */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Hashtags</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {renderResult.hashtags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-mono text-[#5A6478] border border-[#1E2329] px-2.5 py-1 rounded bg-[#0D0F12]"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* Render error */}
      {renderError && (
        <p className="text-xs text-red-400 font-mono border border-red-900/40 bg-red-950/20 px-3 py-2 rounded">
          {renderError}
        </p>
      )}

      {/* Render button */}
      <button
        onClick={handleRender}
        disabled={isRendering}
        className={`w-full py-3.5 rounded font-mono text-sm tracking-[0.08em] uppercase transition-all duration-200
          ${isRendering
            ? 'bg-[#0D0F12] text-[#353D4A] border border-[#1E2329] cursor-not-allowed'
            : 'bg-[#E8FF47] text-[#07080A] font-bold hover:bg-[#F2FF70] active:scale-[0.99]'
          }`}
      >
        {isRendering ? (
          <span className="flex items-center justify-center gap-2">
            <SpinnerIcon />
            Rendering…
          </span>
        ) : (
          'Render Reel'
        )}
      </button>
    </div>
  );
}

// ── Hook Card ─────────────────────────────────────────────────────────────────

function HookCard({
  hook,
  selected,
  onSelect,
}: {
  hook: HookOption;
  selected: boolean;
  onSelect: () => void;
}) {
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
          <span
            style={{ fontFamily: 'var(--font-mono)' }}
            className="text-base text-[#EEF2F7] font-medium leading-tight"
          >
            {hook.text}
          </span>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant={hook.score >= 7 ? 'green' : hook.score >= 5 ? 'amber' : 'red'}>
              Score {hook.score}/10
            </Badge>
            <Badge variant={hook.spellingOk ? 'green' : 'amber'}>
              {hook.spellingOk ? '✓ Spelling' : '⚠ Corrected'}
            </Badge>
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
  caption,
  selected,
  expanded,
  onSelect,
  onToggleExpand,
}: {
  caption: CaptionOption;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div
      className={`rounded border transition-all duration-150 ${
        selected
          ? 'border-[#3B82F6] bg-[#3B82F608] shadow-[0_0_0_1px_#3B82F620]'
          : 'border-[#1E2329] bg-[#0D0F12]'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left p-4"
      >
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
              {caption.format && (
                <Badge variant="neutral">Format {caption.format}</Badge>
              )}
              <Badge variant={caption.score >= 7 ? 'green' : caption.score >= 5 ? 'amber' : 'red'}>
                Score {caption.score}/10
              </Badge>
              {caption.skillScore > 0 && (
                <Badge variant={caption.skillScore >= 7 ? 'green' : 'amber'}>
                  Skill {caption.skillScore}/10
                </Badge>
              )}
              <Badge variant={caption.hasCTA ? 'green' : 'amber'}>
                {caption.hasCTA ? '✓ CTA' : 'No CTA'}
              </Badge>
              <Badge variant={caption.firstLineStrong ? 'green' : 'amber'}>
                {caption.firstLineStrong ? '✓ First line' : '△ First line'}
              </Badge>
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
  return (
    <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">
      {children}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}
