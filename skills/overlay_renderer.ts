import { createCanvas, registerFont } from 'canvas';
import type { CanvasRenderingContext2D } from 'canvas';
import { join } from 'path';
import { writeFileSync } from 'fs';
import type { DesignConfig, ColorPalette, HookFont, LightStreakStyle } from '../schema';

// Register fonts once at module load
const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');
registerFont(join(FONTS_DIR, 'BebasNeue-Regular.ttf'), { family: 'BebasNeue' });
registerFont(join(FONTS_DIR, 'DMSans-Regular.ttf'),    { family: 'DMSans' });

const FRAME_W = 1080;
const FRAME_H = 1920;

// ── Palette resolution ────────────────────────────────────────────────────────

const PALETTE_COLORS: Record<ColorPalette, { primary: string; glow: string }> = {
  'neon-yellow':   { primary: '#E8FF47', glow: 'rgba(232,255,71,0.55)' },
  'electric-blue': { primary: '#3B82F6', glow: 'rgba(59,130,246,0.55)' },
  'hot-pink':      { primary: '#FF2D78', glow: 'rgba(255,45,120,0.55)' },
  'cyber-green':   { primary: '#39FF14', glow: 'rgba(57,255,20,0.55)' },
  'pure-white':    { primary: '#FFFFFF', glow: 'rgba(255,255,255,0.40)' },
  'fire-orange':   { primary: '#FF6B35', glow: 'rgba(255,107,53,0.55)' },
};

// ── Font face mapping ─────────────────────────────────────────────────────────

const FONT_FACE: Record<HookFont, string> = {
  bebas:      'BebasNeue',
  impact:     'Impact',
  oswald:     'BebasNeue', // fallback to Bebas until we ship Oswald .ttf
  montserrat: 'DMSans',    // fallback to DM Sans
};

// ── Word wrap ─────────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.toUpperCase().split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── Light streak renderers ────────────────────────────────────────────────────

function drawLightStreak(
  ctx: CanvasRenderingContext2D,
  style: LightStreakStyle,
  accentColor: string,
  glowColor: string,
): void {
  if (style === 'none') return;

  ctx.save();

  if (style === 'horizontal') {
    // A fast horizontal sweep at ~35% height (hook zone)
    const y = FRAME_H * 0.34;
    const streakHeight = 6;

    // Outer soft glow
    const outerGrad = ctx.createLinearGradient(0, y, FRAME_W, y);
    outerGrad.addColorStop(0,    'rgba(255,255,255,0)');
    outerGrad.addColorStop(0.15, glowColor);
    outerGrad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    outerGrad.addColorStop(0.85, glowColor);
    outerGrad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(0, y - streakHeight * 5, FRAME_W, streakHeight * 10);

    // Sharp bright core
    const coreGrad = ctx.createLinearGradient(0, y, FRAME_W, y);
    coreGrad.addColorStop(0,    'rgba(255,255,255,0)');
    coreGrad.addColorStop(0.3,  accentColor);
    coreGrad.addColorStop(0.5,  '#FFFFFF');
    coreGrad.addColorStop(0.7,  accentColor);
    coreGrad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, y - streakHeight / 2, FRAME_W, streakHeight);
  }

  if (style === 'diagonal') {
    // Diagonal streak from top-right to bottom-left
    ctx.rotate(-Math.PI / 8);
    const cx = FRAME_W * 0.6;
    const cy = FRAME_H * 0.1;

    const grad = ctx.createLinearGradient(cx - 800, cy, cx + 800, cy);
    grad.addColorStop(0,    'rgba(255,255,255,0)');
    grad.addColorStop(0.2,  glowColor);
    grad.addColorStop(0.5,  'rgba(255,255,255,0.85)');
    grad.addColorStop(0.8,  glowColor);
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 900, cy - 80, 1800, 160);

    // Thin core
    const core = ctx.createLinearGradient(cx - 800, cy, cx + 800, cy);
    core.addColorStop(0,   'rgba(255,255,255,0)');
    core.addColorStop(0.4, accentColor);
    core.addColorStop(0.5, '#FFFFFF');
    core.addColorStop(0.6, accentColor);
    core.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(cx - 900, cy - 4, 1800, 8);
  }

  if (style === 'burst') {
    // Radial burst centered at the hook zone
    const cx = FRAME_W / 2;
    const cy = FRAME_H * 0.35;

    const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, 520);
    radial.addColorStop(0,    'rgba(255,255,255,0.6)');
    radial.addColorStop(0.15, glowColor);
    radial.addColorStop(0.45, 'rgba(255,255,255,0.08)');
    radial.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);

    // Add 4 rays
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 4 + Math.PI / 8);
      const rayGrad = ctx.createLinearGradient(0, 0, 0, -560);
      rayGrad.addColorStop(0,   glowColor);
      rayGrad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      rayGrad.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.lineTo(4, -560);
      ctx.lineTo(-4, -560);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

// ── Accent-colored divider line ───────────────────────────────────────────────

function drawDivider(
  ctx: CanvasRenderingContext2D,
  y: number,
  accentColor: string,
): void {
  ctx.save();
  const grad = ctx.createLinearGradient(FRAME_W / 2 - 60, y, FRAME_W / 2 + 60, y);
  grad.addColorStop(0,   'rgba(255,255,255,0)');
  grad.addColorStop(0.3, accentColor);
  grad.addColorStop(0.7, accentColor);
  grad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(FRAME_W / 2 - 60, y);
  ctx.lineTo(FRAME_W / 2 + 60, y);
  ctx.stroke();
  ctx.restore();
}

// ── Text block ────────────────────────────────────────────────────────────────

interface OverlayConfig {
  hookText: string;
  jobId: string;
  outputPath: string;
  design?: DesignConfig;
}

const DEFAULT_DESIGN: DesignConfig = {
  palette:      'neon-yellow',
  font:         'bebas',
  animation:    'none',
  lightStreak:  'none',
  textPosition: 'center',
  showCTA:      true,
};

export async function renderOverlayPNG(config: OverlayConfig): Promise<void> {
  const { hookText, outputPath } = config;
  const design = { ...DEFAULT_DESIGN, ...(config.design ?? {}) };

  const { primary: accentColor, glow: glowColor } = PALETTE_COLORS[design.palette];
  const fontFace = FONT_FACE[design.font];

  // Text position → vertical center Y as fraction of frame
  const positionY: Record<DesignConfig['textPosition'], number> = {
    top:    0.22,
    center: 0.35,
    bottom: 0.72,
  };
  const blockCenterY = FRAME_H * positionY[design.textPosition];

  const canvas = createCanvas(FRAME_W, FRAME_H);
  const ctx    = canvas.getContext('2d');

  // Canvas starts fully transparent — video shows through
  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  // ── Light streak (drawn before scrim so it bleeds through) ──────────────────
  drawLightStreak(ctx, design.lightStreak, accentColor, glowColor);

  // ── Gradient scrim ──────────────────────────────────────────────────────────
  const scrimTop    = FRAME_H * (positionY[design.textPosition] - 0.13);
  const scrimHeight = FRAME_H * 0.44;
  const scrimGrad   = ctx.createLinearGradient(0, scrimTop, 0, scrimTop + scrimHeight);
  scrimGrad.addColorStop(0,    'rgba(0,0,0,0)');
  scrimGrad.addColorStop(0.25, 'rgba(0,0,0,0.6)');
  scrimGrad.addColorStop(0.5,  'rgba(0,0,0,0.70)');
  scrimGrad.addColorStop(0.75, 'rgba(0,0,0,0.6)');
  scrimGrad.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, scrimTop, FRAME_W, scrimHeight);

  // ── Hook text ───────────────────────────────────────────────────────────────
  const SAFE_MARGIN    = 108;
  const MAX_TEXT_WIDTH = FRAME_W - SAFE_MARGIN * 2;
  const FONT_SIZE      = 88;
  const LINE_HEIGHT    = FONT_SIZE * 1.1;

  ctx.font      = `${FONT_SIZE}px ${fontFace}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines           = wrapText(ctx, hookText, MAX_TEXT_WIDTH);
  const totalTextHeight = lines.length * LINE_HEIGHT;
  const blockStartY     = blockCenterY - totalTextHeight / 2;

  lines.forEach((line, i) => {
    const y = blockStartY + i * LINE_HEIGHT + LINE_HEIGHT / 2;
    const x = FRAME_W / 2;

    // Accent-colored glow pass
    ctx.save();
    ctx.shadowColor   = glowColor;
    ctx.shadowBlur    = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle     = accentColor;
    ctx.fillText(line, x, y);
    ctx.restore();

    // Black stroke outline
    ctx.strokeStyle = 'rgba(0,0,0,0.95)';
    ctx.lineWidth   = 6;
    ctx.lineJoin    = 'round';
    ctx.strokeText(line, x, y);

    // Drop shadow + white fill
    ctx.shadowColor   = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur    = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle     = '#FFFFFF';
    ctx.fillText(line, x, y);

    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });

  // ── Accent divider ──────────────────────────────────────────────────────────
  const dividerY = blockStartY + totalTextHeight + 18;
  drawDivider(ctx, dividerY, accentColor);

  // ── CTA ─────────────────────────────────────────────────────────────────────
  if (design.showCTA) {
    const CTA_FONT_SIZE = 36;
    const ctaY          = dividerY + 28;

    ctx.font         = `${CTA_FONT_SIZE}px DMSans`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = 'rgba(0,0,0,0.7)';
    ctx.lineWidth    = 2;
    ctx.strokeText('Read Description', FRAME_W / 2, ctaY);
    ctx.fillStyle    = 'rgba(255,255,255,0.72)';
    ctx.fillText('Read Description', FRAME_W / 2, ctaY);
  }

  // ── Write PNG ───────────────────────────────────────────────────────────────
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(outputPath, buffer);
}
