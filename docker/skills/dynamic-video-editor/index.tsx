/**
 * skills/dynamic-video-editor/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Remotion composition registry.
 *
 * This file is the `entryPoint` that docker/server.js passes to
 * @remotion/bundler. Every composition that can be rendered by the server
 * must be registered here with <Composition />.
 *
 * The server calls selectComposition({ id: 'HormoziReel' }) so that ID must
 * match exactly.
 */

import { Composition } from 'remotion';
import { HormoziReel, hormoziReelSchema, type HormoziReelProps } from './HormoziReel';

// Default props used by Remotion Studio and as the shape reference for
// selectComposition. The render server always overrides these via inputProps.
const DEFAULT_PROPS: HormoziReelProps = {
  rawVideoPath:      '',
  hookText:          'WAIT FOR IT',
  captionText:       '',
  hashtags:          [],
  whisperTranscript: [],
  design: {
    palette:      'neon-yellow',
    font:         'bebas',
    animation:    'none',
    lightStreak:  'none',
    textPosition: 'center',
    showCTA:      true,
  },
  startTime:      0,
  durationMode:   'custom',
  customDuration: 5,
};

// 1080×1920 @ 30 fps — standard vertical Reel format
const FPS    = 30;
const WIDTH  = 1080;
const HEIGHT = 1920;

// Duration is dynamic (driven by durationMode + customDuration in the actual
// component), but Remotion's <Composition> requires a static durationInFrames
// for the studio preview. We use the maximum possible value (30 s).
const MAX_DURATION_FRAMES = 30 * FPS; // 900 frames

export default function Root() {
  return (
    <Composition
      id="HormoziReel"
      component={HormoziReel}
      schema={hormoziReelSchema}
      durationInFrames={MAX_DURATION_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={DEFAULT_PROPS}
    />
  );
}
