---
name: frontend-design
description: Use when building web components, pages, artifacts, posters, or applications — websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI. Use when the user needs production-grade, visually distinctive frontend code that avoids generic AI aesthetics.
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.


## Modern Paradigms & Technical Execution

To achieve production-grade, high-end UI, ground your bold aesthetic choices in modern development paradigms:

- **Layout & Composition**: Utilize asymmetrical Bento box grids, dynamic masonry, and fluid CSS grid/flexbox architectures. Break the grid intentionally, not accidentally.
- **Advanced Styling Techniques**: Incorporate modern visual materials like Glassmorphism (using `backdrop-filter` and subtle translucent borders). Use advanced color spaces (`oklch` or `hsl`) to generate vibrant, non-muddy gradients (mesh, aurora, or conic).
- **Tech Stack & Tooling**: 
  - Use **Tailwind CSS** for precise, utility-first styling, or strict CSS modules with semantic variables.
  - For React, mandate **Framer Motion** for spring-based physics, staggered reveals, and fluid `layoutId` transitions. Do not use generic CSS transitions for complex state changes.
  - Integrate modern, clean iconography (e.g., **Lucide** or **Phosphor**) and high-quality placeholder imagery (e.g., Unsplash source URLs) to ensure layouts feel complete.

## UX, Hierarchy & Code Architecture

Creative freedom must never sacrifice usability or maintainability:

- **Conversion & Hierarchy**: The primary Call to Action (CTA) must always carry the highest visual weight and contrast, regardless of the chosen aesthetic. If using a radical display font for headers, pair it with a highly legible, accessible sans-serif for body copy.
- **Responsive Intent**: Layouts must look just as deliberate and meticulously crafted on mobile devices as they do on desktop displays. No afterthought mobile styling.
- **Componentization**: Break complex UIs down into logical, reusable components (e.g., isolating `HeroCard`, `BentoGrid`, and `Button`). Write clean, modular code.
- **Interactive State**: For functional components (dashboards, forms, interactive widgets), implement basic state management (e.g., `useState` in React) so the UI authentically reacts to user input and demonstrates robust interactive states (hover, focus, active, disabled).