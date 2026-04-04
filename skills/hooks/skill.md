# Hook Generation Skill

## What a hook is

A hook is a 2–6 word text overlay burned into the first second of an Instagram Reel. The viewer reads it before anything else. It is the only thing standing between your video and the scroll.

## What makes a hook viral

A viral hook does one of these things — and does it in 6 words or fewer:

| Mechanism | What it does | Example |
|-----------|--------------|---------|
| **Curiosity gap** | Opens a question the viewer must answer by watching | "You're packing this wrong" |
| **Pattern interrupt** | Says the opposite of the expected take | "Stop optimizing your morning" |
| **Direct address** | Names the viewer's exact situation | "If you travel with a laptop" |
| **Specific claim** | Bold, precise, sounds verifiable | "This saved me 3 hours daily" |
| **Tension/stakes** | Something will be lost or revealed | "I almost missed my flight doing this" |
| **Provocative question** | Sounds wrong, demands an answer | "Why do slow travelers spend less" |

## What kills a hook

- **Generic topic labels** — "Morning routine tips", "How to travel better". These describe what the video is about, not why the viewer can't look away.
- **Filler openers** — "The secret to", "How I", "Why you should", "Here's". They add words without adding tension.
- **Soft language** — "Some tips", "A few ideas". No stakes.
- **Ungrounded vagueness** — "This changed everything". Changed what? For whom?

## Scoring hooks correctly

The QA model must score hooks on **scroll-stopping power**, not surface polish. A hook that is grammatically perfect and completely forgettable deserves a 4. A hook that makes someone stop and think "wait, what?" deserves an 8.

**Scoring rubric:**
- 9–10: Would stop a stranger mid-scroll. Creates a gap they must close.
- 7–8: Strong. Specific to the content. Would perform well.
- 5–6: Adequate. Applies to any video on this topic.
- 3–4: Generic topic summary. No tension or curiosity.
- 1–2: Filler, vague, or bragging without stakes.

**Penalty rules (applied before final score):**
- Generic topic summary, not specific to the video: −3
- Filler opener used: −2
- No curiosity gap or tension of any kind: −2
- Could describe 100 other videos on this topic: −3

## How the brain generates hooks

The `generateHooks` function in `skills/ai_copywriter.ts` generates one hook per viral angle:
1. Pattern interrupt
2. Direct address
3. Specific claim
4. Tension/stakes
5. Provocative question

Each hook is grounded in the specific video content the user described — never in the topic category alone.

The `qaHooks` function scores each hook using the rubric above. The highest scorer is pre-selected but the user sees all 5 with scores.

## Common failure modes to watch for

- **The AI defaults to generic when context is thin.** If the user's video idea is vague ("travel video"), push specifics into the prompt — what specifically happens in the video? The hooks should reflect that.
- **QA inflates scores for safe hooks.** The penalty rules must be enforced. A hook scoring 8 should genuinely stop a scroll.
- **All 5 hooks sound the same.** Each angle should be meaningfully different. If they're all curiosity gaps, the generation failed.
