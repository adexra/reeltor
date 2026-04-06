'use client';

/**
 * components/DesignStudio.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-featured Design Studio panel.
 *
 * Features
 * ─────────
 * • Social handle input (@username, shown bottom-left of the video frame)
 * • Logo upload → Supabase "logos" bucket → logoUrl stored in DesignConfig
 * • 3 preset colour palettes (Neon / Cyber / Classic) + legacy palette picker
 * • Hook font-size slider (1.5 → 4.0 rem, default 2.5)
 * • Base font-size slider (0.7 → 1.4 rem, default 1.0)
 * • Live "Mock Phone" preview — pure CSS, no canvas dependency
 *
 * Props
 * ─────
 * value      — current DesignConfig (controlled)
 * onChange   — called on every config change
 * hookText   — the selected hook text string (for live preview)
 */

import React, { useRef, useState, useTransition } from 'react';
import type { DesignConfig, PaletteColors } from '../schema';
import { createClient } from '@supabase/supabase-js';

// ── Supabase client (anon key — browser-safe) ─────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const LOGOS_BUCKET = 'logos';

// ── Preset palettes ───────────────────────────────────────────────────────────

interface PresetPalette {
  id:     string;
  label:  string;
  colors: PaletteColors;
  bg:     string;   // preview background
}

const PRESET_PALETTES: PresetPalette[] = [
  {
    id:    'neon',
    label: 'Neon',
    bg:    '#07080A',
    colors: { primary: '#E8FF47', secondary: '#FFFFFF', accent: 'rgba(232,255,71,0.7)' },
  },
  {
    id:    'cyber',
    label: 'Cyber',
    bg:    '#050A1A',
    colors: { primary: '#3B82F6', secondary: '#A5C8FF', accent: 'rgba(59,130,246,0.7)' },
  },
  {
    id:    'classic',
    label: 'Classic',
    bg:    '#111111',
    colors: { primary: '#FFFFFF', secondary: '#CCCCCC', accent: 'rgba(255,255,255,0.5)' },
  },
];

// ── Default config values ─────────────────────────────────────────────────────

export const DESIGN_STUDIO_DEFAULTS: Partial<DesignConfig> = {
  handle:        '',
  handleSize:    1.0,
  logoUrl:       '',
  hookFontSize:  2.5,
  baseFontSize:  1.0,
  paletteColors: PRESET_PALETTES[0].colors,
};

// ── Slider ────────────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  accentHex,
}: {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  format:   (v: number) => string;
  onChange: (v: number) => void;
  accentHex: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">{label}</span>
        <span className="text-[11px] font-mono" style={{ color: accentHex }}>{format(value)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-[#1E2329]">
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${pct}%`, background: accentHex, transition: 'width 0.05s' }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          style={{ margin: 0 }}
        />
      </div>
    </div>
  );
}

// ── Mock Phone Preview ────────────────────────────────────────────────────────

const FONT_FAMILY_CSS: Record<string, string> = {
  bebas:      '"Bebas Neue", Impact, sans-serif',
  impact:     'Impact, "Arial Narrow", sans-serif',
  oswald:     '"Oswald", "Bebas Neue", sans-serif',
  montserrat: '"Montserrat", "DM Sans", sans-serif',
};

function MockPhone({
  hookText,
  handle,
  logoUrl,
  paletteColors,
  hookFontSize,
  baseFontSize,
  font,
  showCTA,
}: {
  hookText:      string;
  handle:        string;
  logoUrl:       string;
  paletteColors: PaletteColors;
  hookFontSize:  number;
  baseFontSize:  number;
  font:          string;
  showCTA:       boolean;
}) {
  const displayHook = (hookText.trim() || 'YOUR HOOK HERE').toUpperCase();

  // Short hook (<10 words): scale 2.5→3.2 proportionally, matching canvas logic
  const wordCount = displayHook.split(' ').filter(Boolean).length;
  const autoFS    = wordCount < 10
    ? Math.max(2.5, Math.min(3.2, 3.2 - (wordCount - 1) * 0.08))
    : 2.5;
  // If user manually set a size other than default 2.5, respect it; otherwise auto-scale
  const effectiveFS = hookFontSize === 2.5 ? autoFS : hookFontSize;

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">Live Preview</span>

      {/* Phone shell */}
      <div
        className="relative rounded-[22px] overflow-hidden"
        style={{
          width:     'min(200px, 72vw)',
          aspectRatio: '9/16',
          background: '#07080A',
          boxShadow: `0 0 0 3px #1E2329, 0 0 0 5px #0D0F12, 0 20px 50px rgba(0,0,0,0.8), 0 0 30px ${paletteColors.accent}`,
          transition: 'box-shadow 0.3s',
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-2.5 bg-[#07080A] rounded-b-xl z-20" />

        {/* Scrim */}
        <div
          className="absolute inset-0 z-10"
          style={{
            background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0.5) 70%, transparent)',
          }}
        />

        {/* Hook text */}
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center"
          style={{ top: '-5%' }}
        >
          <span
            style={{
              fontFamily:       FONT_FAMILY_CSS[font] ?? FONT_FAMILY_CSS.bebas,
              fontSize:         `${effectiveFS * 0.55}rem`,
              fontWeight:       900,
              lineHeight:       1.05,
              letterSpacing:    '0.02em',
              textTransform:    'uppercase',
              color:            paletteColors.primary,
              textShadow:       `0 0 20px ${paletteColors.accent}, 2px 3px 0 rgba(0,0,0,0.9)`,
              WebkitTextStroke: '0.5px rgba(0,0,0,0.9)',
              transition:       'font-size 0.2s, color 0.2s',
            }}
          >
            {displayHook}
          </span>
        </div>

        {/* Bottom bar — handle + logo */}
        {(handle || logoUrl) && (
          <div
            className="absolute bottom-4 left-3 right-3 z-20 flex items-center gap-2"
          >
            {logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt="logo"
                style={{
                  width:        `${baseFontSize * 22}px`,
                  height:       `${baseFontSize * 22}px`,
                  borderRadius: '50%',
                  objectFit:    'cover',
                  border:       `1.5px solid ${paletteColors.primary}`,
                  flexShrink:   0,
                }}
              />
            )}
            {handle && (
              <span
                style={{
                  fontFamily:  '"DM Sans", sans-serif',
                  fontSize:    `${baseFontSize * 0.52}rem`,
                  fontWeight:  700,
                  color:       paletteColors.secondary,
                  textShadow:  '1px 1px 3px rgba(0,0,0,0.9)',
                  letterSpacing: '0.03em',
                  overflow:    'hidden',
                  whiteSpace:  'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {handle.startsWith('@') ? handle : `@${handle}`}
              </span>
            )}
          </div>
        )}

        {/* CTA hint — only when enabled */}
        {showCTA && (
          <div
            className="absolute bottom-12 left-0 right-0 z-10 flex justify-center"
          >
            <span
              style={{
                fontFamily:  '"DM Sans", sans-serif',
                fontSize:    `${baseFontSize * 0.4}rem`,
                fontWeight:  500,
                color:       'rgba(255,255,255,0.6)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                textShadow:  '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              Read Description
            </span>
          </div>
        )}

        {/* Home indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-white/20 z-20" />
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">{label}</span>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  value:    DesignConfig;
  onChange: (config: DesignConfig) => void;
  hookText: string;
}

export function DesignStudio({ value, onChange, hookText }: Props) {
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Derived state with defaults
  const paletteColors = value.paletteColors ?? PRESET_PALETTES[0].colors;
  const accentHex     = paletteColors.primary;
  const hookFontSize  = value.hookFontSize  ?? 2.5;
  const baseFontSize  = value.baseFontSize  ?? 1.0;
  const handle        = value.handle        ?? '';
  const handleSize    = value.handleSize    ?? 1.0;
  const logoUrl       = value.logoUrl       ?? '';

  function patch(partial: Partial<DesignConfig>) {
    onChange({ ...value, ...partial });
  }

  // ── Logo upload ────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    startUpload(async () => {
      const ext  = file.name.split('.').pop() ?? 'png';
      const path = `public/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from(LOGOS_BUCKET)
        .upload(path, file, { upsert: true });

      if (error) {
        setUploadError(error.message);
        return;
      }

      const { data } = supabase.storage.from(LOGOS_BUCKET).getPublicUrl(path);
      patch({ logoUrl: data.publicUrl });
    });
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-14 w-full max-w-5xl">

      {/* ── Left: controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-7 flex-1 min-w-0">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentHex }} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: accentHex }}>
              Design Studio
            </span>
          </div>
          <h2
            className="text-2xl font-extrabold text-[#EEF2F7] leading-none"
            style={{ letterSpacing: '-0.03em' }}
          >
            Brand Your Reel
          </h2>
          <p className="text-[#5A6478] text-sm mt-2">
            Add your handle, logo, and choose a colour theme.
          </p>
        </div>

        {/* Preset palettes */}
        <Section label="Colour Presets">
          <div className="grid grid-cols-3 gap-2">
            {PRESET_PALETTES.map((preset) => {
              const active = paletteColors.primary === preset.colors.primary;
              return (
                <button
                  key={preset.id}
                  onClick={() => patch({ paletteColors: preset.colors })}
                  className="flex flex-col items-start gap-2 p-3 rounded-lg border transition-all duration-150"
                  style={{
                    background:  active ? `${preset.colors.primary}10` : '#0D0F12',
                    borderColor: active ? preset.colors.primary : '#1E2329',
                    boxShadow:   active ? `0 0 12px ${preset.colors.accent}` : 'none',
                  }}
                >
                  {/* Colour dots */}
                  <div className="flex gap-1">
                    {[preset.colors.primary, preset.colors.secondary, preset.colors.accent.replace(/rgba?\([^)]+\)/, preset.colors.primary)].slice(0, 2).map((hex, i) => (
                      <span
                        key={i}
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: hex }}
                      />
                    ))}
                  </div>
                  <span
                    className="text-[10px] font-mono uppercase tracking-widest"
                    style={{ color: active ? preset.colors.primary : '#5A6478' }}
                  >
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Social handle */}
        <Section label="Social Handle">
          <div className="flex items-center gap-2 bg-[#0D0F12] border border-[#1E2329] rounded-lg px-4 py-3 focus-within:border-[#E8FF4740] transition-colors">
            <span className="text-[#5A6478] font-mono text-sm select-none">@</span>
            <input
              type="text"
              value={handle.replace(/^@/, '')}
              onChange={(e) => patch({ handle: e.target.value ? `@${e.target.value.replace(/^@/, '')}` : '' })}
              placeholder="yourhandle"
              maxLength={30}
              className="flex-1 bg-transparent text-[#EEF2F7] font-mono text-sm outline-none placeholder:text-[#2A3140]"
            />
          </div>
          <div className="flex gap-2 mt-1">
            {[0.8, 1.0].map((size) => (
              <button
                key={size}
                onClick={() => patch({ handleSize: size })}
                className="px-3 py-1.5 text-[10px] font-mono rounded border transition-all"
                style={{
                  borderColor: handleSize === size ? accentHex : '#1E2329',
                  color:       handleSize === size ? accentHex : '#5A6478',
                  background:  handleSize === size ? `${accentHex}10` : 'transparent',
                }}
              >
                {size === 0.8 ? 'Small' : 'Normal'}
              </button>
            ))}
          </div>
        </Section>

        {/* Logo upload */}
        <Section label="Logo (Circle)">
          <div className="flex items-center gap-4">
            {/* Current logo preview */}
            {logoUrl ? (
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="logo"
                  className="w-12 h-12 rounded-full object-cover"
                  style={{ border: `2px solid ${accentHex}` }}
                />
                <button
                  onClick={() => patch({ logoUrl: '' })}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FF2D78] flex items-center justify-center"
                  title="Remove logo"
                >
                  <span className="text-white text-[9px] font-bold leading-none">×</span>
                </button>
              </div>
            ) : (
              <div
                className="w-12 h-12 rounded-full border-2 border-dashed border-[#1E2329] flex items-center justify-center text-[#353D4A] text-lg shrink-0"
              >
                ✦
              </div>
            )}

            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex-1 py-2.5 rounded border border-[#1E2329] text-xs font-mono text-[#5A6478] hover:border-[#2A3140] hover:text-[#EEF2F7] transition-all disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {uploadError && (
            <p className="text-[10px] font-mono text-[#FF2D78] mt-1">{uploadError}</p>
          )}
          <p className="text-[10px] font-mono text-[#353D4A]">PNG, JPG or WebP — shown as a circle bottom-left.</p>
        </Section>

        {/* Font size sliders */}
        <Section label="Font Sizes">
          <div className="flex flex-col gap-5 bg-[#0D0F12] border border-[#1E2329] rounded-lg p-4">
            <Slider
              label="Hook Text Size"
              value={hookFontSize}
              min={1.5}
              max={4.0}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(v) => patch({ hookFontSize: v })}
              accentHex={accentHex}
            />
            <Slider
              label="Handle / CTA Size"
              value={baseFontSize}
              min={0.7}
              max={1.4}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => patch({ baseFontSize: v })}
              accentHex={accentHex}
            />
          </div>
          {hookFontSize === 2.5 && hookText.trim().split(' ').filter(Boolean).length < 10 && (
            <p className="text-[10px] font-mono text-[#E8FF47] mt-1">
              ✦ Short hook — auto-scaling to {Math.max(2.5, Math.min(3.2, 3.2 - (hookText.trim().split(' ').filter(Boolean).length - 1) * 0.08)).toFixed(1)}× for maximum impact.
            </p>
          )}
        </Section>

      </div>

      {/* ── Right: mock phone preview ───────────────────────────────────────── */}
      <div className="shrink-0 flex justify-center lg:justify-start lg:pt-12">
        <MockPhone
          hookText={hookText}
          handle={handle}
          logoUrl={logoUrl}
          paletteColors={paletteColors}
          hookFontSize={hookFontSize}
          baseFontSize={baseFontSize}
          font={value.font ?? 'bebas'}
          showCTA={value.showCTA ?? false}
        />
      </div>

    </div>
  );
}
