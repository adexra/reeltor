// schema.ts — Single source of truth. Always import from here, never redefine.

export type ClipDurationMode = 'short' | 'standard';
export type ToneOption = 'Inspirational' | 'Assertive' | 'Playful' | 'Luxury' | 'Educational';

// ── Design Config ─────────────────────────────────────────────────────────────

export type ColorPalette =
  | 'neon-yellow'   // #E8FF47 (default brand)
  | 'electric-blue' // #3B82F6
  | 'hot-pink'      // #FF2D78
  | 'cyber-green'   // #39FF14
  | 'pure-white'    // #FFFFFF
  | 'fire-orange';  // #FF6B35

export type HookFont =
  | 'bebas'         // Bebas Neue — bold condensed (default)
  | 'impact'        // Impact — heavy
  | 'oswald'        // Oswald — modern condensed
  | 'montserrat';   // Montserrat — clean bold

export type AnimationStyle =
  | 'none'          // Static overlay
  | 'fade-in'       // Text fades in
  | 'slide-up'      // Text slides up
  | 'zoom-in';      // Text zooms in from small

export type LightStreakStyle =
  | 'none'
  | 'horizontal'    // Fast horizontal lens flare sweep
  | 'diagonal'      // Diagonal streak from corner
  | 'burst';        // Center burst / halo

export interface DesignConfig {
  palette:      ColorPalette;
  font:         HookFont;
  animation:    AnimationStyle;
  lightStreak:  LightStreakStyle;
  textPosition: 'top' | 'center' | 'bottom'; // Vertical zone for hook text
  showCTA:      boolean;
}
export type JobStatus = 'pending' | 'processing' | 'done' | 'error';
export type PipelineStep = 'upload' | 'ai' | 'ffmpeg' | 'done' | 'error';

export interface BusinessContext {
  businessName: string;
  targetAudience: string;
  tone: ToneOption;
  productDescription: string;
}

export interface GenerateRequest {
  videoIdea: string;
  startTime: number;           // seconds from start of uploaded video
  durationMode: ClipDurationMode;
  customDuration?: number;     // only used when durationMode === 'standard', range 15–30
  context: BusinessContext;
}

export interface AIGeneratedContent {
  hook: string;
  caption: string;
  hashtags: string[];
}

export interface FFmpegConfig {
  inputPath: string;
  outputPath: string;
  startTime: number;
  duration: number;
  hook: string;
  resolution: { width: 1080; height: 1920 };
  design?: DesignConfig;
}

export interface ReelJob {
  jobId: string;
  createdAt: string;           // ISO timestamp
  status: JobStatus;
  request: GenerateRequest;
  aiContent: AIGeneratedContent | null;
  outputPath: string | null;
  captionPath: string | null;
  errorMessage: string | null;
}

export interface SSEProgressEvent {
  step: PipelineStep | Phase1Step | Phase2Step;
  progress: number;            // 0–100
  jobId?: string;
  message?: string;
  error?: string;
  result?: GenerationResult;
  renderResult?: RenderResult;
}

export const CLIP_DURATIONS = {
  short: { min: 3, max: 5 },
  standard: { min: 15, max: 30 },
} as const;

export const OUTPUT_DIR = 'output';
export const LOG_DIR = 'heres_whats_up';

// ── Hook option ───────────────────────────────────────────────────────────────

export interface HookOption {
  id: string;           // "hook_1" through "hook_5"
  text: string;
  score: number;        // 1–10 from QA model
  spellingOk: boolean;
  wordCount: number;
  isRecommended: boolean;
}

// ── Caption option ────────────────────────────────────────────────────────────

export interface CaptionOption {
  id: string;           // "caption_1" through "caption_5"
  text: string;
  format: string;       // A / B / C / D / E
  score: number;        // merged QA + skill score
  spellingOk: boolean;
  hasCTA: boolean;
  toneMatch: boolean;
  noForbiddenPhrases: boolean;
  noMarkdown: boolean;
  firstLineStrong: boolean;
  skillScore: number;   // score from skill validation pass
  isRecommended: boolean;
}

// ── Phase 1 result — hooks only ───────────────────────────────────────────────

export interface GenerationResult {
  jobId: string;
  hooks: HookOption[];
  selectedHookId: string;      // pre-selected (highest score)
  status: 'awaiting_hook' | 'rendering' | 'done' | 'error';
}

// ── Phase 2 result — captions + hashtags ─────────────────────────────────────

export interface RenderResult {
  jobId: string;
  selectedHookText: string;
  captions: CaptionOption[];
  hashtags: string[];
  selectedCaptionId: string;   // pre-selected (highest score)
  status: 'awaiting_caption' | 'rendering' | 'done' | 'error';
  design?: DesignConfig;
}

// ── SSE step types ────────────────────────────────────────────────────────────

export type Phase1Step =
  | 'upload'
  | 'generating_hooks'
  | 'qa_hooks'
  | 'ready';

export type Phase2Step =
  | 'generating_captions'
  | 'qa_captions'
  | 'captions_ready'
  | 'rendering'
  | 'saving'
  | 'done'
  | 'error';
