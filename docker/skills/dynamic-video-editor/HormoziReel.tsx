/**
 * skills/dynamic-video-editor/HormoziReel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Hormozi-style" Remotion composition.
 *
 * Behaviour
 * ─────────
 * • Plays the raw source video (cropped to 1080×1920).
 * • Renders word-level captions driven by Whisper timestamps.
 *   Each word pops in with a spring scale+opacity animation exactly when
 *   Whisper says it starts, and fades out when the next word arrives.
 * • Falls back to a single static hook overlay if no transcript is provided
 *   (matches the existing canvas/FFmpeg behaviour for backwards compat).
 * • Accepts the full DesignConfig from components/DesignEditor.tsx so palette,
 *   font, animation style, light streak, and CTA are all user-controllable.
 *
 * Hormozi caption rules (hard-coded style choices):
 *   • ALL CAPS, centred, Bebas Neue (or the user's chosen font)
 *   • One word highlighted at a time — the "active" word gets the accent colour
 *     and a scale-spring pop; the previous word dims to white/60% opacity
 *   • Tight black stroke + drop shadow for legibility on any background
 *   • No line breaks mid-thought — one word per "beat" fills the safe zone
 *
 * Props contract (must match inputProps sent by docker/server.js):
 *   rawVideoPath      — absolute path to the video file INSIDE the container
 *   hookText          — text displayed before transcript kicks in (frame 0)
 *   captionText       — not rendered on-screen; used by the handoff page
 *   hashtags          — not rendered on-screen; used by the handoff page
 *   whisperTranscript — WordTimestamp[] from audio_transcriber.ts
 *   design            — DesignConfig from schema.ts
 *   startTime         — seconds offset into the source video
 *   durationMode      — 'short' (3–5 s) | 'standard' (15–30 s)
 *   customDuration    — seconds, only honoured when durationMode === 'standard'
 */

import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion';
import { z } from 'zod';
import type { DesignConfig, ColorPalette, HookFont } from '../../schema';
import type { WordTimestamp } from '../audio_transcriber';

// ── Zod schema (used by Remotion Studio for prop validation) ──────────────────

export const hormoziReelSchema = z.object({
  rawVideoPath:      z.string(),
  hookText:          z.string(),
  captionText:       z.string(),
  hashtags:          z.array(z.string()),
  whisperTranscript: z.array(
    z.object({ word: z.string(), start: z.number(), end: z.number() }),
  ),
  design: z.object({
    palette:       z.string(),
    font:          z.string(),
    animation:     z.string(),
    lightStreak:   z.string(),
    textPosition:  z.string(),
    showCTA:       z.boolean(),
    // Design Studio extensions
    handle:        z.string().optional(),
    handleSize:    z.number().optional(),
    logoUrl:       z.string().optional(),
    hookFontSize:  z.number().optional(),
    baseFontSize:  z.number().optional(),
    paletteColors: z.object({
      primary:   z.string(),
      secondary: z.string(),
      accent:    z.string(),
    }).optional(),
  }),
  startTime:      z.number(),
  durationMode:   z.enum(['short', 'standard']),
  customDuration: z.number().nullable(),
});

export type HormoziReelProps = z.infer<typeof hormoziReelSchema>;

// ── Palette → hex ─────────────────────────────────────────────────────────────

const PALETTE_HEX: Record<ColorPalette, { primary: string; glow: string }> = {
  'neon-yellow':   { primary: '#E8FF47', glow: 'rgba(232,255,71,0.7)' },
  'electric-blue': { primary: '#3B82F6', glow: 'rgba(59,130,246,0.7)' },
  'hot-pink':      { primary: '#FF2D78', glow: 'rgba(255,45,120,0.7)' },
  'cyber-green':   { primary: '#39FF14', glow: 'rgba(57,255,20,0.7)' },
  'pure-white':    { primary: '#FFFFFF', glow: 'rgba(255,255,255,0.5)' },
  'fire-orange':   { primary: '#FF6B35', glow: 'rgba(255,107,53,0.7)' },
};

// ── Font → CSS font-family ────────────────────────────────────────────────────
// Remotion bundles fonts via staticFile() or Google Fonts in the webpack config.
// We list the CSS names here; the actual @font-face declarations live in
// skills/dynamic-video-editor/fonts.css (loaded by index.ts via a global import).

const FONT_FAMILY: Record<HookFont, string> = {
  bebas:      '"Bebas Neue", Impact, sans-serif',
  impact:     'Impact, "Arial Narrow", sans-serif',
  oswald:     '"Oswald", "Bebas Neue", sans-serif',
  montserrat: '"Montserrat", "DM Sans", sans-serif',
};

// ── Timing helpers ────────────────────────────────────────────────────────────

/** Convert a Whisper timestamp (seconds) to Remotion frame number. */
function toFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface WordProps {
  word:        string;
  isActive:    boolean;
  isPast:      boolean;
  accentColor: string;
  glowColor:   string;
  fontFamily:  string;
  hookFontPx:  number;
  frameOffset: number;  // frame relative to the start of this word's Sequence
  fps:         number;
}

function AnimatedWord({
  word,
  isActive,
  isPast,
  accentColor,
  glowColor,
  fontFamily,
  hookFontPx,
  frameOffset,
  fps,
}: WordProps) {
  // Spring pops the word in from scale 0.6 → 1.0 with a snappy feel
  const scale = isActive
    ? spring({
        frame:   frameOffset,
        fps,
        config:  { damping: 14, stiffness: 280, mass: 0.6 },
        from:    0.6,
        to:      1.0,
      })
    : 1.0;

  // Opacity: active = full, past = dimmed, future = 0 (hidden)
  const opacity = isActive ? 1 : isPast ? 0.35 : 0;

  // Active word gets accent colour + glow; past words turn white/dimmed
  const color     = isActive ? accentColor : '#FFFFFF';
  const textShadow = isActive
    ? `0 0 30px ${glowColor}, 0 0 8px ${glowColor}, 3px 4px 0 rgba(0,0,0,0.9)`
    : '2px 3px 0 rgba(0,0,0,0.8)';

  const webkitStroke = isActive ? '3px rgba(0,0,0,0.95)' : '2px rgba(0,0,0,0.7)';

  return (
    <span
      style={{
        display:              'inline-block',
        transform:            `scale(${scale})`,
        transformOrigin:      'center bottom',
        opacity,
        color,
        fontFamily,
        fontSize:             hookFontPx,
        fontWeight:           900,
        lineHeight:           1.0,
        letterSpacing:        '0.02em',
        textTransform:        'uppercase',
        textShadow,
        WebkitTextStroke:     webkitStroke,
        paintOrder:           'stroke fill',
        transition:           'color 0.05s',
        userSelect:           'none',
        willChange:           'transform, opacity',
      }}
    >
      {word}
    </span>
  );
}

// ── Static hook overlay (shown before transcript begins) ──────────────────────

interface StaticHookProps {
  text:        string;
  accentColor: string;
  glowColor:   string;
  fontFamily:  string;
  positionY:   number;
  hookFontPx:  number;
  baseFontPx:  number;
  frame:       number;
  fps:         number;
  animStyle:   string;
}

function StaticHook({
  text, accentColor, glowColor, fontFamily, positionY,
  hookFontPx, baseFontPx, frame, fps, animStyle,
}: StaticHookProps) {
  // Entry animation — driven by design.animation
  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  if (animStyle === 'fade-in') {
    opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  } else if (animStyle === 'slide-up') {
    translateY = interpolate(frame, [0, 15], [60, 0], { extrapolateRight: 'clamp' });
    opacity    = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  } else if (animStyle === 'zoom-in') {
    scale   = spring({ frame, fps, config: { damping: 16, stiffness: 200, mass: 0.7 }, from: 0.5, to: 1 });
    opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  }

  const lines = text.toUpperCase().split(' ');

  return (
    <div
      style={{
        position:         'absolute',
        left:             0,
        right:            0,
        top:              `${positionY * 100}%`,
        transform:        `translateY(-50%) translateY(${translateY}px) scale(${scale})`,
        opacity,
        display:          'flex',
        flexDirection:    'column',
        alignItems:       'center',
        gap:              4,
        paddingInline:    80,
        pointerEvents:    'none',
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily,
            fontSize:         hookFontPx,
            fontWeight:       900,
            lineHeight:       1.0,
            letterSpacing:    '0.02em',
            textTransform:    'uppercase',
            color:            accentColor,
            textShadow:       `0 0 40px ${glowColor}, 0 0 10px ${glowColor}, 3px 5px 0 rgba(0,0,0,0.95)`,
            WebkitTextStroke: '4px rgba(0,0,0,0.95)',
            paintOrder:       'stroke fill',
            textAlign:        'center',
            userSelect:       'none',
          }}
        >
          {line}
        </div>
      ))}

      {/* Divider — matches canvas: thin horizontal stroke, rgba white at 40% */}
      <div
        style={{
          marginTop:    12,
          width:        200,
          height:       2,
          borderRadius: 1,
          background:   'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
        }}
      />

      <div
        style={{
          marginTop:        10,
          fontFamily:       '"DM Sans", sans-serif',
          fontSize:         Math.round(baseFontPx * 0.85),
          fontWeight:       500,
          color:            'rgba(255,255,255,0.72)',
          textShadow:       '1px 2px 0 rgba(0,0,0,0.7)',
          WebkitTextStroke: '1px rgba(0,0,0,0.5)',
          paintOrder:       'stroke fill',
          letterSpacing:    '0.06em',
          textTransform:    'uppercase',
          userSelect:       'none',
        }}
      >
        Read Description
      </div>
    </div>
  );
}

// ── Scrim overlay (darkens the video behind text) ─────────────────────────────

function Scrim({ positionY }: { positionY: number }) {
  const top    = Math.max(0, positionY - 0.18);
  const height = 0.44;
  return (
    <div
      style={{
        position:   'absolute',
        left:       0,
        right:      0,
        top:        `${top * 100}%`,
        height:     `${height * 100}%`,
        background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 25%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.55) 75%, transparent 100%)',
        pointerEvents: 'none',
      }}
    />
  );
}

// ── Main composition ──────────────────────────────────────────────────────────

export function HormoziReel({
  rawVideoPath,
  hookText,
  whisperTranscript,
  design,
  startTime,
  durationMode,
  customDuration,
}: HormoziReelProps) {
  const frame              = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Design resolution ──────────────────────────────────────────────────────
  const palette    = (design.palette as ColorPalette) ?? 'neon-yellow';
  const font       = (design.font    as HookFont)     ?? 'bebas';
  const fontFamily = FONT_FAMILY[font] ?? FONT_FAMILY.bebas;

  // paletteColors from DesignStudio overrides the built-in lookup.
  // Falls back to the string-keyed PALETTE_HEX table for older jobs.
  const accentColor = design.paletteColors?.primary
    ?? PALETTE_HEX[palette]?.primary
    ?? PALETTE_HEX['neon-yellow'].primary;
  const glowColor   = design.paletteColors?.accent
    ?? PALETTE_HEX[palette]?.glow
    ?? PALETTE_HEX['neon-yellow'].glow;
  const secondaryColor = design.paletteColors?.secondary ?? '#FFFFFF';

  // Handle + logo
  const handle     = design.handle    ?? '';
  const handleSize = design.handleSize ?? 1.0;
  const logoUrl    = design.logoUrl   ?? '';

  // Font sizes — rem values converted to px at 1080px canvas width.
  // Base rem = 1080 / 27 ≈ 40px (matches typical mobile viewport scaling).
  const BASE_REM    = 40;
  const baseFontSize = design.baseFontSize ?? 1.0;

  // Hook font size — proportional auto-scale matching GeneratorPanel canvas logic:
  // Short hook (<10 words) scales linearly from 2.5→3.2rem.
  // Only applies when user hasn't overridden from the default 2.5.
  const rawHookFontSize = design.hookFontSize ?? 2.5;
  const hookWordCount   = hookText.trim().split(/\s+/).filter(Boolean).length;
  const autoScaledRem   = hookWordCount < 10
    ? Math.max(2.5, Math.min(3.2, 3.2 - (hookWordCount - 1) * 0.08))
    : 2.5;
  const hookFontSizeRem = rawHookFontSize === 2.5 ? autoScaledRem : rawHookFontSize;
  const hookFontPx = Math.round(hookFontSizeRem * BASE_REM);

  const positionFraction: Record<string, number> = {
    top:    0.22,
    center: 0.38,
    bottom: 0.72,
  };
  const positionY = positionFraction[design.textPosition] ?? 0.38;

  // ── Determine actual clip duration in frames ───────────────────────────────
  // The composition is registered at MAX_DURATION_FRAMES (900) but we honour
  // the actual job duration so renders don't over-run.
  const clipDurationSecs = durationMode === 'short'
    ? Math.min(5, durationInFrames / fps)    // clamp to short range
    : Math.min(customDuration ?? 20, 30);    // cap at 30 s standard
  const clipFrames = Math.round(clipDurationSecs * fps);

  // ── Build per-word Sequence params from Whisper timestamps ─────────────────
  const wordSequences = useMemo(() => {
    if (!whisperTranscript || whisperTranscript.length === 0) return [];
    return whisperTranscript.map((w: WordTimestamp, i: number) => {
      const startFrame = toFrame(w.start, fps);
      // Duration = gap to next word start, capped at 2 s, min 3 frames
      const nextStart = whisperTranscript[i + 1]?.start ?? (w.end + 0.5);
      const durationFrames = Math.max(3, toFrame(nextStart - w.start, fps));
      return { word: w.word, startFrame, durationFrames, index: i };
    });
  }, [whisperTranscript, fps]);

  // ── Determine active / past word at current frame ──────────────────────────
  const activeWordIndex = wordSequences.findLastIndex((ws) => frame >= ws.startFrame);

  // ── Whisper transcript mode vs static hook mode ────────────────────────────
  const hasTranscript = wordSequences.length > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>

      {/* ── Source video ──────────────────────────────────────────────────── */}
      <AbsoluteFill>
        <OffthreadVideo
          src={rawVideoPath.startsWith('file://') ? rawVideoPath : `file://${rawVideoPath}`}
          startFrom={Math.round(startTime * fps)}
          endAt={Math.round(startTime * fps) + clipFrames}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* ── Gradient scrim behind text ─────────────────────────────────────── */}
      <Scrim positionY={positionY} />

      {/* ── Caption layer ─────────────────────────────────────────────────── */}
      {hasTranscript ? (
        <AbsoluteFill
          style={{
            display:        'flex',
            alignItems:     positionY < 0.4 ? 'flex-start' : positionY > 0.6 ? 'flex-end' : 'center',
            justifyContent: 'center',
            paddingTop:     positionY < 0.4 ? `${positionY * 100}%` : 0,
            paddingBottom:  positionY > 0.6 ? `${(1 - positionY) * 100}%` : 0,
            paddingInline:  80,
            pointerEvents:  'none',
          }}
        >
          {wordSequences.map(({ word, startFrame, durationFrames, index }) => (
            <Sequence
              key={index}
              from={startFrame}
              durationInFrames={durationFrames}
              layout="none"
            >
              <AnimatedWordSequenceItem
                word={word}
                isActive={index === activeWordIndex}
                isPast={index < activeWordIndex}
                accentColor={accentColor}
                glowColor={glowColor}
                fontFamily={fontFamily}
                hookFontPx={hookFontPx}
                fps={fps}
              />
            </Sequence>
          ))}
        </AbsoluteFill>
      ) : (
        <StaticHook
          text={hookText}
          accentColor={accentColor}
          glowColor={glowColor}
          fontFamily={fontFamily}
          positionY={positionY}
          hookFontPx={hookFontPx}
          baseFontPx={Math.round(baseFontSize * BASE_REM)}
          frame={frame}
          fps={fps}
          animStyle={design.animation}
        />
      )}

      {/* ── Logo + Handle overlay (bottom-left) ───────────────────────────── */}
      {(logoUrl || handle) && (
        <div
          style={{
            position:   'absolute',
            bottom:     60,
            left:       48,
            display:    'flex',
            alignItems: 'center',
            gap:        18,
            pointerEvents: 'none',
          }}
        >
          {logoUrl && (
            <Img
              src={logoUrl}
              style={{
                width:        Math.round(handleSize * 72),
                height:       Math.round(handleSize * 72),
                borderRadius: '50%',
                objectFit:    'cover',
                border:       `3px solid ${accentColor}`,
                boxShadow:    `0 0 14px ${glowColor}`,
                flexShrink:   0,
              }}
            />
          )}
          {handle && (
            <span
              style={{
                fontFamily:       '"DM Sans", sans-serif',
                fontSize:         Math.round(handleSize * baseFontSize * BASE_REM * 0.8),
                fontWeight:       700,
                color:            secondaryColor,
                textShadow:       '0 2px 8px rgba(0,0,0,0.9)',
                WebkitTextStroke: '1px rgba(0,0,0,0.6)',
                paintOrder:       'stroke fill',
                letterSpacing:    '0.03em',
              }}
            >
              {handle.startsWith('@') ? handle : `@${handle}`}
            </span>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
}

// ── AnimatedWordSequenceItem ──────────────────────────────────────────────────
// Thin wrapper that reads useCurrentFrame() inside a Sequence context so it
// gets the Sequence-local frame (always starts at 0 for each word).

interface SequenceItemProps {
  word:        string;
  isActive:    boolean;
  isPast:      boolean;
  accentColor: string;
  glowColor:   string;
  fontFamily:  string;
  hookFontPx:  number;
  fps:         number;
}

function AnimatedWordSequenceItem({
  word, isActive, isPast, accentColor, glowColor, fontFamily, hookFontPx, fps,
}: SequenceItemProps) {
  const frameOffset = useCurrentFrame();

  return (
    <div
      style={{
        position:       'absolute',
        left:           0,
        right:          0,
        display:        'flex',
        justifyContent: 'center',
        alignItems:     'center',
        pointerEvents:  'none',
      }}
    >
      <AnimatedWord
        word={word}
        isActive={isActive}
        isPast={isPast}
        accentColor={accentColor}
        glowColor={glowColor}
        fontFamily={fontFamily}
        hookFontPx={hookFontPx}
        frameOffset={frameOffset}
        fps={fps}
      />
    </div>
  );
}
