# Reelator — Automated Viral Reels Infrastructure

Reelator is a specialized automation engine designed to generate high-conversion short-form video content (Instagram Reels, TikToks) by combining AI-generated copy with precision video editing.

## 1. Project Overview

The core philosophy of Reelator is **"High Signal, Low Noise"**. It doesn't just generate generic video; it uses a multi-pass QA process to filter for viral "hooks" and "captions" based on proven performance psychology.

### Tech Stack
- **Framework**: Next.js 16 (Node.js runtime)
- **AI Core**: Azure OpenAI (GPT-4o)
- **Video Engine**: FFmpeg (via `fluent-ffmpeg`)
- **Graphic Engine**: Node-canvas (for high-fidelity text overlays)
- **Storage/State**: In-memory `jobStore` + local filesystem persistence

---

## 2. Architecture & File Structure

Reelator uses a **"Skills"** architecture, where complex business logic is modularized into independent, reusable modules.

```bash
/app           # Next.js App Router (Routes & API)
/components    # UI components for the generation dashboard
/lib           # Core utilities (jobStore, global state)
/skills        # THE CORE LOGIC:
  ├── ai_copywriter.ts    # Hook/Caption/Hashtag generation
  ├── ffmpeg_editor.ts    # Video cutting and compositing
  ├── overlay_renderer.ts # Dynamic PNG generation (Node-canvas)
  └── library_manager.ts # Result persistence and logging
/assets        # Fonts and static assets for rendering
/public        # Publicly accessible files
/output        # Local directory for generated jobs
/heres_whats_up # Automated logs and error tracking
```

---

## 3. Core Modules (The "Skills")

### A. AI Copywriter (`skills/ai_copywriter.ts`)
This module is the "brain" of Reelator. It performs multi-step generation and validation:
1.  **Generate Hooks**: Creates 5 viral hooks using specific "angles" (Pattern Interrupt, Tension, etc.).
2.  **QA Hooks**: A second AI model scores hooks (1-10) based on strict virality rubrics.
3.  **Generate Captions**: Writes 150-300 word long-form captions designed to keep viewers engaged.
4.  **QA/Skill Validation**: Validates captions against specific brand guidelines and "forbidden phrases" lists.
5.  **Generate Hashtags**: Strategizes niche-specific tags for maximal reach.

### B. FFmpeg Editor (`skills/ffmpeg_editor.ts`)
Handles the heavy lifting of video processing:
- **Cutting**: Precise extraction of clips based on `startTime` and `duration`.
- **Scaling/Cropping**: Automatically converts any input video to 1080x1920 (9:16).
- **Compositing**: Merges the video stream with the rendered PNG overlay from the Overlay Renderer.

### C. Overlay Renderer (`skills/overlay_renderer.ts`)
Creates professional-grade text overlays using Node-canvas:
- **Theming**: Supports multiple color palettes (Neon Yellow, Electric Blue, etc.).
- **Typography**: Uses Bebas Neue and DM Sans for an editorial Look.
- **Visual Effects**: Renders "Light Streaks" (Lens flares), "Bursts", and gradient scrims for maximum legibility and premium feel.

---

## 4. The Generation Pipeline

The generation process is split into two asynchronous phases to optimize for performance and user feedback.

### Phase 1: Hook Discovery
- **User Action**: Uploads a video clip and provides a "Video Idea" and "Business Context".
- **Backend**:
  1. Saves the raw video to a temporary location.
  2. Generates 5 hook options.
  3. Performs a QA pass to score each hook.
- **Result**: The user is presented with 5 scored hooks and picks the winner.

### Phase 2: Content & Render
- **User Action**: Selects a preferred hook.
- **Backend (2a)**:
  1. Generates 5 long-form captions based on the chosen hook.
  2. Validates captions against skill-specific guidelines.
  3. Generates the final 5 hashtags.
- **Backend (2b)**:
  1. Renders the custom text overlay PNG.
  2. Runs the FFmpeg pipeline to cut, scale, and composite the final reel.
  3. Moves the result to the permanent `/output` library.

---

## 5. Data Modeling (`schema.ts`)

Reelator defines its entire data lifecycle in `schema.ts`. Key items:

- **`DesignConfig`**: Controls the visual style (Palette, Font, Animation, Text Position).
- **`GenerateRequest`**: The initial payload (Video Idea, Start Time, Context).
- **`ReelJob`**: The "single source of truth" for a job, tracking status from `pending` to `done`.
- **`HookOption` / `CaptionOption`**: Individual content variations with associated QA scores.

---

## 6. API Reference

- **`POST /api/generate`**: Initiates Phase 1. Returns a `jobId`.
- **`POST /api/render`**: 
  - `phase: 'captions'`: Generates captions for a chosen hook.
  - `phase: 'render'`: Triggers the final FFmpeg render.
- **`GET /api/library`**: Retrieves a list of all historical `ReelJob` documents.
- **`GET /api/generate/progress?jobId=...`**: SSE (Server-Sent Events) endpoint for real-time progress updates.

---

## 8. Major Updates & v2 Infrastructure (2026-04-04)

Reelator has undergone a major overhaul to improve render quality and copywriting virality.

### A. Hybrid Rendering Engine
The system shifted from pure FFmpeg `drawtext` filters to a **Node-canvas hybrid** (`skills/overlay_renderer.ts`). 
- **Overlays**: High-fidelity overlays are rendered as transparent PNGs using Node-canvas.
- **FFmpeg**: Now strictly handles video extraction (cut), scaling, and the final composite of the PNG overlay onto the video stream.
- **Benefits**: Resolved character escaping issues, enabled advanced typography (Bebas Neue/DM Sans), and implemented 1080x1920 safe-zone enforcement.

### B. Hook-First Decoupled Pipeline
The generation pipeline was split into two distinct user-interaction phases:
1. **Phase 1 (Hook Discovery)**: Generates 5 hooks using specific viral angles (Pattern Interrupt, Tension, etc.).
2. **Phase 2a (Post-Selection Copy)**: Only *after* a hook is chosen, the system generates 5 long-form captions (150–300 words) anchored specifically to that hook.
3. **Phase 2b (Final Render)**: Composites the chosen hook and renders the final file.

### C. Advanced Viral Copywriting
- **Hook Scoring**: A dedicated AI analyst scores hooks (1–10) and applies mandatory penalties for generic openers (e.g., "The secret to...", "Protect your...").
- **Caption Formats**: Supports 5 distinct structural formats (A–E) designed for "5-second loop" reels where the caption does the heavy lifting.
- **Skill Validation**: Every caption is validated against external guidelines in `skills/descriptions/skill.md` for tone, target audience alignment, and forbidden phrase checking.

### D. Visual Polish
- **Gradient Scrims**: Dynamic black-to-transparent scrims added behind text for maximum legibility on any background.
- **Light Streaks**: Support for "Burst", "Diagonal", and "Horizontal" lens flare effects center on the hook zone.
- **Color Palettes**: Locked-in premium palettes (Neon Yellow, Electric Blue, Cyber Green).

### E. Technical Stability
- **Prompt Engineering**: Rewritten system prompts for Azure OpenAI to enforce word counts, emoji limits (max 2), and avoid "marketing speak."

---

## 9. Technical Deep Dives

### A. Cross-Device Reliability (EXDEV)
The system is designed to run in environments where temporary files and final outputs live on separate physical drives (e.g., `C:\Temp` and `F:\Reelator\Output`). 
- **Fix**: `skills/library_manager.ts` uses an atomic `copyFile` → `unlink` pattern instead of a standard `rename`, preventing `EXDEV` failures common in partitioned Windows/Linux setups.

### B. Global Event Bus (SSE)
Since Next.js route handlers are stateless, Reelator uses a `globalThis` singleton (`lib/jobStore.ts`) to manage Server-Sent Events (SSE).
- **Buffering**: If a frontend client connects *after* the generation step has already progressed, the system flushes the "event buffer" to the client immediately upon registration, ensuring no progress steps are missed.

### C. Audio Intelligence (Whisper)
A foundational skill (`skills/audio_transcriber.ts`) is integrated to provide word-level timestamps via Azure OpenAI Whisper.
- **Spec**: Returns `WordTimestamp[]` with per-word start/end times and detected language.
- **Future Use**: Intended for dynamic, word-highlighted captions in the video overlay.

### D. Modular Skill Architecture
The project structure is centered around **Modular Skills**, each with its own `SKILL.md` instruction set. This allows specialized AI agents to handle specific domains:
- `brand-guidelines/`: Enforces visual and tonal consistency.
- `theme-factory/`: Manages CSS and color scheme generation.
- `webapp-testing/`: Automated QA for the browser interface.
- `skill-creator/`: Self-bootstrapping logic for adding new abilities to Reelator.
