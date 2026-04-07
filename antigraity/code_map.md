# Reelator Code Map

This document provides a comprehensive mapping of the Reelator infrastructure, detailing the purpose and relationship of all directories and files.

## 1. Project Root
- `app/` — [Next.js App Router] Contains all routes, layouts, and API endpoints.
- `components/` — [UI Layer] React components for the dashboard and generation interface.
- `lib/` — [Shared Logic] State management, database utilities, and shared constants.
- `skills/` — [Core Engine] Modular business logic and AI agents.
- `assets/` — [Static Assets] Fonts, icons, and design resources for rendering.
- `public/` — [Browser Assets] Publicly accessible SVGs and static files.
- `output/` — [Job Storage] Local persistence for generated video jobs.
- `antigraity/` — [Agent Isolation] Restricted area for AI agent control and documentation.
- `heres_whats_up/` — [Logging] Automated logs for errors and updates.
- `schema.ts` — Central data modeling and TypeScript definitions.
- `package.json` — Dependency management and project script.

---

## 2. Directory Deep Dive

### 📂 `app/` (The Application)
- `layout.tsx` — Root layout providing global providers and styles.
- `page.tsx` — The main dashboard interface.
- `globals.css` — Global styling and design system tokens.
- `api/` — Backend logic:
  - `generate/` — Phase 1 logic (Hook discovery).
  - `render/` — Phase 2 logic (Captions & FFmpeg rendering).
  - `library/` — Job retrieval and history management.

### 📂 `skills/` (The Engine)
- `ai_copywriter.ts` — Logic for generating hooks and captions via Azure OpenAI.
- `ffmpeg_editor.ts` — Video manipulation (cutting, scaling, compositing).
- `overlay_renderer.ts` — Node-canvas renderer for dynamic video overlays.
- `library_manager.ts` — Logic for saving and organizing job data.
- **Support Skills** (Sub-folders containing specific `SKILL.md` instructions for agents):
  - `algorithmic-art/`, `brand-guidelines/`, `build-reels/`, `canvas-design/`, `descriptions/`, `docx/`, `dynamic-video-editor/`, `frontend-design/`, `hooks/`, `mcp-builder/`, `pdf/`, `skill-creator/`, `theme-factory/`, `webapp-testing/`, `xlsx/`.

### 📂 `components/` (The Interface)
- `ContextSidebar.tsx` — Handles business and video context input.
- `GeneratorPanel.tsx` — Controls for the generation stages.
- `DesignEditor.tsx` — Visual customization for the video render.
- `SelectionPanel.tsx` — Interface for picking hooks and captions.
- `LibraryGrid.tsx` / `ReelCard.tsx` — Browsing completed jobs.
- `ProgressTracker.tsx` — Real-time feedback for long-running renders.

### 📂 `lib/` (The Infrastructure)
- `jobStore.ts` — In-memory job tracking with file-system hydration.

### 📂 `output/` (Generated Content)
- `[job-id]/` — Directory created for each generation:
  - `clip.mp4` — The final rendered video.
  - `meta.json` — Full job metadata (Design, Content, Status).
  - `render_chunk.json` — Intermediate render logs.
  - `caption.txt` — Generated social media copy.

### 📂 `antigraity/` (Agent Sandbox)
- `RULES.md` — Critical restrictions for AI agents.
- `code_map.md` — (This file) Complete project architectural map.
- `documentation.md` — High-level project overview and architecture.
- `settings.local.json` — Agent-specific configuration.

