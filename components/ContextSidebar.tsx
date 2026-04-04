'use client';

import { useEffect, useState } from 'react';
import type { BusinessContext, ToneOption } from '../schema';

const TONE_OPTIONS: { value: ToneOption; label: string; glyph: string }[] = [
  { value: 'Inspirational', label: 'Inspirational', glyph: '✦' },
  { value: 'Assertive',     label: 'Assertive',     glyph: '▲' },
  { value: 'Playful',       label: 'Playful',        glyph: '◉' },
  { value: 'Luxury',        label: 'Luxury',         glyph: '◆' },
  { value: 'Educational',   label: 'Educational',    glyph: '□' },
];

const STORAGE_KEY = 'reelator_context';

const defaultContext: BusinessContext = {
  businessName: '',
  targetAudience: '',
  tone: 'Inspirational',
  productDescription: '',
};

interface Props {
  onChange: (ctx: BusinessContext) => void;
  onClose?: () => void;
}

export function ContextSidebar({ onChange, onClose }: Props) {
  const [ctx, setCtx] = useState<BusinessContext>(defaultContext);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as BusinessContext;
        setCtx(parsed);
        onChange(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof BusinessContext>(key: K, value: BusinessContext[K]) {
    const next = { ...ctx, [key]: value };
    setCtx(next);
    onChange(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  return (
    <aside
      style={{ fontFamily: 'var(--font-body)' }}
      className="w-64 shrink-0 flex flex-col h-full overflow-y-auto"
      // border right
    >
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-[#1E2329]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[#E8FF47] text-xs font-mono tracking-widest uppercase">Context</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1 text-[#5A6478] hover:text-[#EEF2F7] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
        <p className="text-[#353D4A] text-xs leading-relaxed">
          Saved to browser. Powers every reel.
        </p>
      </div>

      <div className="flex flex-col gap-6 p-5 flex-1">
        {/* Business Name */}
        <SideField label="Business">
          <input
            type="text"
            value={ctx.businessName}
            onChange={(e) => update('businessName', e.target.value)}
            placeholder="Bloom Wellness Studio"
            className="input-field"
          />
        </SideField>

        {/* Target Audience */}
        <SideField label="Audience">
          <input
            type="text"
            value={ctx.targetAudience}
            onChange={(e) => update('targetAudience', e.target.value)}
            placeholder="Women 25–40, wellness"
            className="input-field"
          />
        </SideField>

        {/* Tone — pill selector */}
        <SideField label="Tone">
          <div className="flex flex-col gap-1.5">
            {TONE_OPTIONS.map(({ value, label, glyph }) => (
              <button
                key={value}
                type="button"
                onClick={() => update('tone', value)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-left text-xs transition-all duration-150 border ${
                  ctx.tone === value
                    ? 'border-[#E8FF47] bg-[#E8FF4710] text-[#E8FF47]'
                    : 'border-[#1E2329] text-[#5A6478] hover:border-[#2A3140] hover:text-[#EEF2F7]'
                }`}
              >
                <span className="text-[10px] opacity-70">{glyph}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </SideField>

        {/* Product Description */}
        <SideField label="Product / Service">
          <textarea
            value={ctx.productDescription}
            onChange={(e) => update('productDescription', e.target.value)}
            placeholder="What you sell or offer…"
            rows={4}
            className="input-field resize-none"
          />
        </SideField>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#1E2329]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF47] opacity-60" />
          <span className="text-[10px] font-mono text-[#353D4A] uppercase tracking-widest">
            Auto-saved
          </span>
        </div>
      </div>
    </aside>
  );
}

function SideField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">
        {label}
      </label>
      {children}
    </div>
  );
}
