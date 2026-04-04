import { createCanvas, registerFont } from 'canvas';
import type { CanvasRenderingContext2D } from 'canvas';
import { join } from 'path';
import { writeFileSync } from 'fs';

// Register fonts once at module load
const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');
registerFont(join(FONTS_DIR, 'BebasNeue-Regular.ttf'), { family: 'BebasNeue' });
registerFont(join(FONTS_DIR, 'DMSans-Regular.ttf'), { family: 'DMSans' });

const FRAME_W = 1080;
const FRAME_H = 1920;

interface OverlayConfig {
  hookText: string;
  jobId: string;
  outputPath: string;
}

// Word wrap — returns array of lines, never exceeding maxWidth px
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.toUpperCase().split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const measured = ctx.measureText(candidate).width;
    if (measured > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderOverlayPNG(config: OverlayConfig): Promise<void> {
  const { hookText, outputPath } = config;

  const canvas = createCanvas(FRAME_W, FRAME_H);
  const ctx = canvas.getContext('2d');

  // Canvas starts fully transparent — video shows through
  ctx.clearRect(0, 0, FRAME_W, FRAME_H);

  // --- GRADIENT SCRIM ---
  // Soft vertical gradient covering the text zone only
  // Sits from 22% to 66% of frame height
  const scrimTop = FRAME_H * 0.22;
  const scrimHeight = FRAME_H * 0.44;
  const scrimGradient = ctx.createLinearGradient(0, scrimTop, 0, scrimTop + scrimHeight);
  scrimGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  scrimGradient.addColorStop(0.25, 'rgba(0, 0, 0, 0.55)');
  scrimGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.65)');
  scrimGradient.addColorStop(0.75, 'rgba(0, 0, 0, 0.55)');
  scrimGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = scrimGradient;
  ctx.fillRect(0, scrimTop, FRAME_W, scrimHeight);

  // --- HOOK TEXT ---
  const SAFE_MARGIN = 108; // 10% of 1080
  const MAX_TEXT_WIDTH = FRAME_W - SAFE_MARGIN * 2; // 864px
  const FONT_SIZE = 88;
  const LINE_HEIGHT = FONT_SIZE * 1.1;

  ctx.font = `${FONT_SIZE}px BebasNeue`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = wrapText(ctx, hookText, MAX_TEXT_WIDTH);
  const totalTextHeight = lines.length * LINE_HEIGHT;

  // Start hook block centered at 35% from top
  const blockStartY = FRAME_H * 0.35 - totalTextHeight / 2;

  lines.forEach((line, i) => {
    const y = blockStartY + i * LINE_HEIGHT + LINE_HEIGHT / 2;
    const x = FRAME_W / 2;

    // Black stroke (outline)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(line, x, y);

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    // White fill
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, x, y);

    // Reset shadow for next element
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });

  // --- DIVIDER LINE ---
  const dividerY = blockStartY + totalTextHeight + 18;
  ctx.beginPath();
  ctx.moveTo(FRAME_W / 2 - 50, dividerY);
  ctx.lineTo(FRAME_W / 2 + 50, dividerY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- READ DESCRIPTION CTA ---
  const CTA_FONT_SIZE = 36;
  const ctaY = dividerY + 28;

  ctx.font = `${CTA_FONT_SIZE}px DMSans`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Subtle stroke
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 2;
  ctx.strokeText('Read Description', FRAME_W / 2, ctaY);

  // Semi-transparent white fill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fillText('Read Description', FRAME_W / 2, ctaY);

  // --- WRITE PNG ---
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(outputPath, buffer);
}
