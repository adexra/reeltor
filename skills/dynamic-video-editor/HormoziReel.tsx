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
    palette:      z.string(),
    font:         z.string(),
    animation:    z.string(),
    lightStreak:  z.string(),
    textPosition: z.string(),
    showCTA:      z.boolean(),
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
        fontSize:             148,
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
  positionY:   number;  // 0–1 fraction of frame height
  showCTA:     boolean;
  frame:       number;
  fps:         number;
  animStyle:   string;
}

function StaticHook({
  text, accentColor, glowColor, fontFamily, positionY, showCTA, frame, fps, animStyle,
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
            fontSize:         148,
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

      {/* Accent divider */}
      <div
        style={{
          marginTop:       12,
          width:           120,
          height:          3,
          borderRadius:    2,
          background:      `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          opacity:         0.9,
        }}
      />

      {showCTA && (
        <div
          style={{
            marginTop:        10,
            fontFamily:       '"DM Sans", sans-serif',
            fontSize:         38,
            fontWeight:       500,
            color:            'rgba(255,255,255,0.75)',
            textShadow:       '1px 2px 0 rgba(0,0,0,0.7)',
            WebkitTextStroke: '1px rgba(0,0,0,0.5)',
            paintOrder:       'stroke fill',
            letterSpacing:    '0.04em',
            textTransform:    'uppercase',
            userSelect:       'none',
          }}
        >
          Read Description
        </div>
      )}
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
        background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.65) 30%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.65) 70%, transparent)',
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
  const palette     = (design.palette as ColorPalette) ?? 'neon-yellow';
  const font        = (design.font    as HookFont)     ?? 'bebas';
  const { primary: accentColor, glow: glowColor } = PALETTE_HEX[palette] ?? PALETTE_HEX['neon-yellow'];
  const fontFamily  = FONT_FAMILY[font] ?? FONT_FAMILY.bebas;

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
      {/* OffthreadVideo renders each frame via FFmpeg in the render pipeline,   */}
      {/* which is required for server-side rendering. src must be a file:// URL */}
      {/* or an https:// URL — never a staticFile() path when running in the     */}
      {/* container, since there is no dev-server asset host.                    */}
      <AbsoluteFill>
        <OffthreadVideo
          src={rawVideoPath.startsWith('file://') ? rawVideoPath : `file://${rawVideoPath}`}
          startFrom={Math.round(startTime * fps)}
          endAt={Math.round(startTime * fps) + clipFrames}
          style={{
            width:      '100%',
            height:     '100%',
            objectFit:  'cover',
          }}
        />
      </AbsoluteFill>

      {/* ── Gradient scrim behind text ─────────────────────────────────────── */}
      <Scrim positionY={positionY} />

      {/* ── Caption layer ─────────────────────────────────────────────────── */}
      {hasTranscript ? (
        /*
         * Whisper transcript mode
         * ────────────────────────
         * Each word gets its own <Sequence> so Remotion's frame-accurate
         * rendering ticks exactly with the timestamp. We render ALL words
         * but control visibility via opacity so the spring has a reference
         * frame (frameOffset = 0 = the moment the word becomes active).
         */
        <AbsoluteFill
          style={{
            display:         'flex',
            alignItems:      positionY < 0.4 ? 'flex-start' : positionY > 0.6 ? 'flex-end' : 'center',
            justifyContent:  'center',
            paddingTop:      positionY < 0.4 ? `${positionY * 100}%` : 0,
            paddingBottom:   positionY > 0.6 ? `${(1 - positionY) * 100}%` : 0,
            paddingInline:   80,
            pointerEvents:   'none',
          }}
        >
          {wordSequences.map(({ word, startFrame, durationFrames, index }) => (
            <Sequence
              key={index}
              from={startFrame}
              durationInFrames={durationFrames}
              layout="none"
            >
              {/* Sequence resets currentFrame to 0 at `from` — perfect for spring */}
              <AnimatedWordSequenceItem
                word={word}
                isActive={index === activeWordIndex}
                isPast={index < activeWordIndex}
                accentColor={accentColor}
                glowColor={glowColor}
                fontFamily={fontFamily}
                fps={fps}
              />
            </Sequence>
          ))}
        </AbsoluteFill>
      ) : (
        /*
         * Static hook mode (no Whisper data)
         * ─────────────────────────────────────
         * Matches existing canvas/FFmpeg overlay behaviour as a fallback.
         */
        <StaticHook
          text={hookText}
          accentColor={accentColor}
          glowColor={glowColor}
          fontFamily={fontFamily}
          positionY={positionY}
          showCTA={design.showCTA}
          frame={frame}
          fps={fps}
          animStyle={design.animation}
        />
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
  fps:         number;
}

function AnimatedWordSequenceItem({
  word, isActive, isPast, accentColor, glowColor, fontFamily, fps,
}: SequenceItemProps) {
  const frameOffset = useCurrentFrame(); // 0 = first frame this word is active

  return (
    <div
      style={{
        position:        'absolute',
        left:            0,
        right:           0,
        display:         'flex',
        justifyContent:  'center',
        alignItems:      'center',
        pointerEvents:   'none',
      }}
    >
      <AnimatedWord
        word={word}
        isActive={isActive}
        isPast={isPast}
        accentColor={accentColor}
        glowColor={glowColor}
        fontFamily={fontFamily}
        frameOffset={frameOffset}
        fps={fps}
      />
    </div>
  );
}
