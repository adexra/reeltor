'use client';

import { useState, useEffect, useRef } from 'react';
import type {
  DesignConfig,
  ColorPalette,
  HookFont,
  AnimationStyle,
  LightStreakStyle,
  RenderResult,
} from '../schema';

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_DESIGN: DesignConfig = {
  palette:      'neon-yellow',
  font:         'bebas',
  animation:    'none',
  lightStreak:  'none',
  textPosition: 'center',
  showCTA:      true,
};

// ── Palette metadata ──────────────────────────────────────────────────────────

const PALETTES: { id: ColorPalette; label: string; hex: string; glow: string }[] = [
  { id: 'neon-yellow',   label: 'Neon Yellow',   hex: '#E8FF47', glow: '#E8FF4740' },
  { id: 'electric-blue', label: 'Electric Blue', hex: '#3B82F6', glow: '#3B82F640' },
  { id: 'hot-pink',      label: 'Hot Pink',      hex: '#FF2D78', glow: '#FF2D7840' },
  { id: 'cyber-green',   label: 'Cyber Green',   hex: '#39FF14', glow: '#39FF1440' },
  { id: 'pure-white',    label: 'Pure White',    hex: '#FFFFFF', glow: '#FFFFFF30' },
  { id: 'fire-orange',   label: 'Fire Orange',   hex: '#FF6B35', glow: '#FF6B3540' },
];

const FONTS: { id: HookFont; label: string; sample: string }[] = [
  { id: 'bebas',      label: 'Bebas Neue',  sample: 'BOLD IMPACT' },
  { id: 'impact',     label: 'Impact',      sample: 'HEAVY PUNCH' },
  { id: 'oswald',     label: 'Oswald',      sample: 'MODERN CLEAN' },
  { id: 'montserrat', label: 'Montserrat',  sample: 'SMOOTH STYLE' },
];

const ANIMATIONS: { id: AnimationStyle; label: string; icon: string }[] = [
  { id: 'none',     label: 'Static',    icon: '▬' },
  { id: 'fade-in',  label: 'Fade In',   icon: '◎' },
  { id: 'slide-up', label: 'Slide Up',  icon: '↑' },
  { id: 'zoom-in',  label: 'Zoom In',   icon: '⊕' },
];

const STREAKS: { id: LightStreakStyle; label: string; icon: string }[] = [
  { id: 'none',       label: 'None',       icon: '·' },
  { id: 'horizontal', label: 'Horizontal', icon: '→' },
  { id: 'diagonal',   label: 'Diagonal',   icon: '↗' },
  { id: 'burst',      label: 'Burst',      icon: '✦' },
];

const POSITIONS: { id: DesignConfig['textPosition']; label: string }[] = [
  { id: 'top',    label: 'Top' },
  { id: 'center', label: 'Center' },
  { id: 'bottom', label: 'Bottom' },
];

// ── Live canvas preview ───────────────────────────────────────────────────────

function LivePreview({
  hookText,
  design,
}: {
  hookText: string;
  design: DesignConfig;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette   = PALETTES.find((p) => p.id === design.palette)!;
  const font      = FONTS.find((f) => f.id === design.font)!;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const scale = W / 1080;

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0D0F12');
    bgGrad.addColorStop(1, '#07080A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 27 * scale) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 27 * scale) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Light streak preview
    drawStreakPreview(ctx, design.lightStreak, palette.hex, palette.glow, W, H, scale);

    // Text position
    const posY: Record<DesignConfig['textPosition'], number> = {
      top: 0.22, center: 0.35, bottom: 0.72,
    };
    const blockCenterY = H * posY[design.textPosition];

    // Scrim
    const scrimTop  = H * (posY[design.textPosition] - 0.13);
    const scrimH    = H * 0.44;
    const scrimGrad = ctx.createLinearGradient(0, scrimTop, 0, scrimTop + scrimH);
    scrimGrad.addColorStop(0,    'rgba(0,0,0,0)');
    scrimGrad.addColorStop(0.25, 'rgba(0,0,0,0.65)');
    scrimGrad.addColorStop(0.5,  'rgba(0,0,0,0.75)');
    scrimGrad.addColorStop(0.75, 'rgba(0,0,0,0.65)');
    scrimGrad.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = scrimGrad;
    ctx.fillRect(0, scrimTop, W, scrimH);

    // Hook text
    const SAFE   = 108 * scale;
    const MAX_W  = W - SAFE * 2;
    const FS     = Math.round(88 * scale);
    const LH     = FS * 1.1;
    const fontFamilyMap: Record<HookFont, string> = {
      bebas: 'BebasNeue, Impact, sans-serif',
      impact: 'Impact, sans-serif',
      oswald: 'BebasNeue, Impact, sans-serif',
      montserrat: '"DM Sans", Inter, sans-serif',
    };

    ctx.font         = `${FS}px ${fontFamilyMap[design.font]}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const text  = (hookText.trim() || 'YOUR HOOK HERE').toUpperCase();
    const lines = wrapText(ctx, text, MAX_W);
    const totalH = lines.length * LH;
    const blockStartY = blockCenterY - totalH / 2;

    lines.forEach((line, i) => {
      const x = W / 2;
      const y = blockStartY + i * LH + LH / 2;

      // Accent glow
      ctx.save();
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur  = 30 * scale;
      ctx.fillStyle   = palette.hex;
      ctx.fillText(line, x, y);
      ctx.restore();

      // Black stroke
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.lineWidth   = 6 * scale;
      ctx.lineJoin    = 'round';
      ctx.strokeText(line, x, y);

      // White fill with shadow
      ctx.shadowColor   = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur    = 12 * scale;
      ctx.shadowOffsetX = 3 * scale;
      ctx.shadowOffsetY = 4 * scale;
      ctx.fillStyle     = '#FFFFFF';
      ctx.fillText(line, x, y);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    });

    // Accent divider
    const dividerY = blockStartY + totalH + 18 * scale;
    const divGrad  = ctx.createLinearGradient(W / 2 - 60 * scale, dividerY, W / 2 + 60 * scale, dividerY);
    divGrad.addColorStop(0,   'rgba(255,255,255,0)');
    divGrad.addColorStop(0.3, palette.hex);
    divGrad.addColorStop(0.7, palette.hex);
    divGrad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth   = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 60 * scale, dividerY);
    ctx.lineTo(W / 2 + 60 * scale, dividerY);
    ctx.stroke();

    // CTA
    if (design.showCTA) {
      const ctaFS = Math.round(36 * scale);
      const ctaY  = dividerY + 28 * scale;
      ctx.font         = `${ctaFS}px "DM Sans", Inter, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle  = 'rgba(0,0,0,0.7)';
      ctx.lineWidth    = 2 * scale;
      ctx.strokeText('Read Description', W / 2, ctaY);
      ctx.fillStyle    = 'rgba(255,255,255,0.72)';
      ctx.fillText('Read Description', W / 2, ctaY);
    }

    // Animation badge overlay (hint only)
    if (design.animation !== 'none') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8 * scale, 8 * scale, 90 * scale, 22 * scale);
      ctx.fillStyle = palette.hex;
      ctx.font      = `${Math.round(11 * scale)}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`✦ ${design.animation.replace('-', ' ').toUpperCase()}`, 12 * scale, 19 * scale);
    }
  }, [hookText, design, palette, font]);

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">Design Preview</span>
      <div
        className="relative rounded-[20px] overflow-hidden"
        style={{
          width: 'min(220px, 80vw)',
          height: 'min(390px, 142vw)',
          boxShadow: `0 0 0 3px #1E2329, 0 0 0 5px #0D0F12, 0 20px 60px rgba(0,0,0,0.7), 0 0 40px ${PALETTES.find(p => p.id === design.palette)?.glow ?? 'transparent'}`,
          transition: 'box-shadow 0.3s ease',
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-3 bg-[#07080A] rounded-b-xl z-10" />
        <canvas ref={canvasRef} width={220} height={390} className="w-full h-full" />
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-white/20" />
      </div>
    </div>
  );
}

function drawStreakPreview(
  ctx: CanvasRenderingContext2D,
  style: LightStreakStyle,
  accentHex: string,
  accentGlow: string,
  W: number,
  H: number,
  scale: number,
) {
  if (style === 'none') return;
  ctx.save();

  if (style === 'horizontal') {
    const y = H * 0.34;
    const outer = ctx.createLinearGradient(0, y, W, y);
    outer.addColorStop(0,    'rgba(255,255,255,0)');
    outer.addColorStop(0.15, accentGlow);
    outer.addColorStop(0.5,  'rgba(255,255,255,0.9)');
    outer.addColorStop(0.85, accentGlow);
    outer.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, y - 5 * scale, W, 10 * scale);

    const core = ctx.createLinearGradient(0, y, W, y);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.3, accentHex);
    core.addColorStop(0.5, '#FFFFFF');
    core.addColorStop(0.7, accentHex);
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, y - 1.5 * scale, W, 3 * scale);
  }

  if (style === 'diagonal') {
    ctx.rotate(-Math.PI / 8);
    const cx = W * 0.6;
    const cy = H * 0.1;
    const grad = ctx.createLinearGradient(cx - 200, cy, cx + 200, cy);
    grad.addColorStop(0,   'rgba(255,255,255,0)');
    grad.addColorStop(0.2, accentGlow);
    grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.8, accentGlow);
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 250, cy - 20 * scale, 500, 40 * scale);

    const core = ctx.createLinearGradient(cx - 200, cy, cx + 200, cy);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.4, accentHex);
    core.addColorStop(0.5, '#FFFFFF');
    core.addColorStop(0.6, accentHex);
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(cx - 250, cy - 2, 500, 4);
  }

  if (style === 'burst') {
    const cx = W / 2;
    const cy = H * 0.35;
    const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, 130 * scale);
    radial.addColorStop(0,    'rgba(255,255,255,0.6)');
    radial.addColorStop(0.15, accentGlow);
    radial.addColorStop(0.5,  'rgba(255,255,255,0.06)');
    radial.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 4 + Math.PI / 8);
      const rayGrad = ctx.createLinearGradient(0, 0, 0, -140 * scale);
      rayGrad.addColorStop(0,   accentGlow);
      rayGrad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      rayGrad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(-3 * scale, 0);
      ctx.lineTo(3 * scale, 0);
      ctx.lineTo(1 * scale, -140 * scale);
      ctx.lineTo(-1 * scale, -140 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current); current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── Design Editor Component ───────────────────────────────────────────────────

interface Props {
  renderResult: RenderResult;
  onConfirm: (design: DesignConfig) => void;
  onBack: () => void;
}

export function DesignEditor({ renderResult, onConfirm, onBack }: Props) {
  const [design, setDesign] = useState<DesignConfig>(
    renderResult.design ?? DEFAULT_DESIGN,
  );

  function set<K extends keyof DesignConfig>(key: K, val: DesignConfig[K]) {
    setDesign((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 w-full max-w-5xl">

      {/* ── Left: controls ── */}
      <div className="flex flex-col gap-7 flex-1 min-w-0">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: PALETTES.find(p => p.id === design.palette)?.hex }} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: PALETTES.find(p => p.id === design.palette)?.hex }}>
              Step 3 of 3 — Design
            </span>
          </div>
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
            className="text-2xl font-extrabold text-[#EEF2F7] leading-none"
          >
            Design Your Reel
          </h2>
          <p className="text-[#5A6478] text-sm mt-2">
            Customise colors, font, animation, and visual effects.
          </p>
        </div>

        {/* Color Palette */}
        <Section label="Color Palette">
          <div className="grid grid-cols-3 gap-2">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => set('palette', p.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded border text-xs font-mono transition-all duration-150 ${
                  design.palette === p.id
                    ? 'border-current bg-[#0D0F12]'
                    : 'border-[#1E2329] text-[#5A6478] hover:border-[#2A3140] hover:text-[#EEF2F7]'
                }`}
                style={design.palette === p.id ? { color: p.hex, borderColor: p.hex, boxShadow: `0 0 10px ${p.glow}` } : {}}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: p.hex, boxShadow: design.palette === p.id ? `0 0 6px ${p.hex}` : 'none' }}
                />
                {p.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Font */}
        <Section label="Hook Font">
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() => set('font', f.id)}
                className={`px-3 py-3 rounded border text-left transition-all duration-150 ${
                  design.font === f.id
                    ? 'border-[#E8FF47] bg-[#E8FF4708]'
                    : 'border-[#1E2329] hover:border-[#2A3140] bg-[#0D0F12]'
                }`}
              >
                <span className="block text-xs font-mono text-[#5A6478] uppercase tracking-widest mb-1">
                  {f.label}
                </span>
                <span
                  className={`text-sm tracking-wide ${design.font === f.id ? 'text-[#EEF2F7]' : 'text-[#353D4A]'}`}
                  style={{
                    fontFamily: f.id === 'bebas' || f.id === 'oswald'
                      ? 'BebasNeue, Impact, sans-serif'
                      : '"DM Sans", Inter, sans-serif',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                  }}
                >
                  {f.sample}
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* Light Streaks */}
        <Section label="Light Streaks">
          <div className="grid grid-cols-4 gap-2">
            {STREAKS.map((s) => (
              <button
                key={s.id}
                onClick={() => set('lightStreak', s.id)}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded border text-xs font-mono transition-all duration-150 ${
                  design.lightStreak === s.id
                    ? 'border-[#E8FF47] bg-[#E8FF4708] text-[#E8FF47]'
                    : 'border-[#1E2329] text-[#5A6478] hover:border-[#2A3140] hover:text-[#EEF2F7]'
                }`}
              >
                <span className="text-lg leading-none">{s.icon}</span>
                <span className="text-[9px] uppercase tracking-widest">{s.label}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* Animation */}
        <Section label="Text Animation">
          <div className="grid grid-cols-4 gap-2">
            {ANIMATIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => set('animation', a.id)}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded border text-xs font-mono transition-all duration-150 ${
                  design.animation === a.id
                    ? 'border-[#E8FF47] bg-[#E8FF4708] text-[#E8FF47]'
                    : 'border-[#1E2329] text-[#5A6478] hover:border-[#2A3140] hover:text-[#EEF2F7]'
                }`}
              >
                <span className="text-lg leading-none">{a.icon}</span>
                <span className="text-[9px] uppercase tracking-widest">{a.label}</span>
              </button>
            ))}
          </div>
          {design.animation !== 'none' && (
            <p className="text-[10px] font-mono text-[#353D4A] mt-2">
              Animation applies to the rendered video output. Preview shows static frame.
            </p>
          )}
        </Section>

        {/* Text Position */}
        <Section label="Hook Text Position">
          <div className="flex gap-2">
            {POSITIONS.map((pos) => (
              <button
                key={pos.id}
                onClick={() => set('textPosition', pos.id)}
                className={`flex-1 py-2.5 px-3 rounded border text-xs font-mono transition-all duration-150 ${
                  design.textPosition === pos.id
                    ? 'border-[#E8FF47] bg-[#E8FF4712] text-[#E8FF47]'
                    : 'border-[#1E2329] text-[#5A6478] hover:border-[#2A3140] hover:text-[#EEF2F7]'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </Section>

        {/* CTA toggle */}
        <Section label="Options">
          <button
            onClick={() => set('showCTA', !design.showCTA)}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded border text-sm font-mono transition-all duration-150 ${
              design.showCTA
                ? 'border-[#E8FF4740] bg-[#E8FF4706] text-[#EEF2F7]'
                : 'border-[#1E2329] text-[#5A6478] hover:border-[#2A3140]'
            }`}
          >
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
              design.showCTA ? 'border-[#E8FF47] bg-[#E8FF47]' : 'border-[#2A3140]'
            }`}>
              {design.showCTA && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2" stroke="#07080A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            Show "Read Description" CTA
          </button>
        </Section>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-5 py-3 border border-[#1E2329] text-[#5A6478] font-mono text-sm rounded hover:border-[#2A3140] hover:text-[#EEF2F7] transition-colors uppercase tracking-wide"
          >
            ← Back
          </button>
          <button
            onClick={() => onConfirm(design)}
            className="flex-1 py-3 bg-[#E8FF47] text-[#07080A] font-mono text-sm font-bold rounded hover:bg-[#F2FF70] transition-colors uppercase tracking-wide"
          >
            Render with this design →
          </button>
        </div>
      </div>

      {/* ── Right: preview ── */}
      <div className="shrink-0 flex justify-center lg:justify-start lg:pt-14">
        <LivePreview hookText={renderResult.selectedHookText} design={design} />
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-[0.12em]">{label}</span>
      {children}
    </div>
  );
}
