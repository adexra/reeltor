# Antigravity Skills Library

Welcome to the **Antigravity Skills Library** for the Reelator project. This directory contains a powerful collection of specialized skills designed to enable expert-level automation across video production, design, copywriting, and technical development.

## 🚀 Overview

These skills are categorized into two types:
1.  **Workflow Skills (Directories)**: Comprehensive instruction sets (`SKILL.md`) that guide the AI through complex multi-step processes.
2.  **Functional Utilities (Files)**: Core TypeScript implementations that handle the low-level heavy lifting like video rendering, transcription, and AI generation.

---

## 🛠️ Workflow Skills

| Skill | Purpose | When to Use |
| :--- | :--- | :--- |
| **[Algorithmic Art](./algorithmic-art)** | Generative art creation using p5.js. | When users request original generative art, flow fields, or interactive mathematical visualizations. |
| **[Brand Guidelines](./brand-guidelines)** | Adexra's dark UI design system. | To ensure every UI, asset, or document follows the high-contrast technical aesthetic of Adexra. |
| **[Build Reels](./build-reels)** | Short-form video optimization. | When the user needs advice on shooting (4K/60fps), export settings (1080p), or platform-specific upload quality. |
| **[Canvas Design](./canvas-design)** | Static visual art (.png/.pdf). | To create posters, philosophy-based abstract art, or high-end static designs. |
| **[Cybersecurity](./cybersecurity)** | Security auditing & architecture. | When discussing network design, cloud infra, Zero Trust, data privacy (LGPD/GDPR), or AI "vibe coding" security. |
| **[Descriptions](./descriptions)** | Engaging Instagram Reel captions. | To generate 5-part captions (Hook, Body, Emojis, CTA, Hashtags) optimized for viral reach. |
| **[DOCX](./docx)** | Word document manipulation. | For creating, editing, or analyzing professional Word documents with advanced formatting. |
| **[Dynamic Video Editor](./dynamic-video-editor)** | Retention-focused video editing. | To plan "anti-static" edits, J-cuts/L-cuts, and build high-retention frameworks for YouTube/Shorts. |
| **[Frontend Design](./frontend-design)** | Premium web component building. | When building React components, landing pages, or dashboards that need a distinctive, non-AI look. |
| **[Viral Hooks](./hooks)** | Psychology-backed video openers. | To craft "scroll-stopping" first 3 seconds of content using neuro-performance patterns. |
| **[MCP Builder](./mcp-builder)** | Model Context Protocol server creation. | When building new tool integrations using TypeScript or Python MCP SDKs. |
| **[PDF](./pdf)** | PDF processing and creation. | For merging, splitting, OCR-ing, or watermarking PDF files, and extracting data from tables. |
| **[Skill Creator](./skill-creator)** | Antigravity skill development. | When you need to create, test, or optimize *new* skills for this library. |
| **[Theme Factory](./theme-factory)** | Visual theme orchestration. | To apply consistent color and font palettes across any generated artifact or presentation. |
| **[Webapp Testing](./webapp-testing)** | Automated UI testing. | When you need to verify local web applications using Playwright scripts. |
| **[XLSX](./xlsx)** | Professional spreadsheet modeling. | For building clean, formula-based Excel files with financial modeling standards. |

---

## ⚙️ Functional Utilities

These standalone files represent the core engine of the Reelator automation pipeline:

-   **`ai_copywriter.ts`**: Connects to Azure OpenAI to execute the hook and caption generation strategies.
-   **`audio_transcriber.ts`**: Powers the word-level timestamping (Whisper) required for dynamic caption overlays in videos.
-   **`ffmpeg_editor.ts`**: The video processing hub that handles cutting, scaling to 1080x1920, and compositing.
-   **`library_manager.ts`**: Manages the local file system for completed jobs, log files, and metadata persistence.
-   **`overlay_renderer.ts`**: A Node-canvas implementation that generates the visually stunning hook overlays seen in the final videos.

---

## 🎨 Design Philosophy

A common thread across all "Creative" skills (**Algorithmic Art**, **Canvas Design**, **Frontend Design**) is the emphasis on **Extreme Craftsmanship**. 

> [!IMPORTANT]
> These skills are designed to produce work that looks like it took **countless hours of human labor**. Avoid generic "AI aesthetics"—prioritize asymmetric layouts, distinctive typography, and intentional color theory.

---

## 📝 How to Add a New Skill

If you need to extend this library:
1. Use the **[Skill Creator](./skill-creator)** workflow.
2. Create a new subdirectory.
3. Add a `SKILL.md` file with names and descriptions in the YAML frontmatter.
4. (Optional) Add a `scripts/` folder for binary/heavy utility scripts.
