import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  HookOption,
  CaptionOption,
  BusinessContext,
} from '../schema';

// Whisper lives in its own module. Re-export so existing imports of
// transcribeWithWhisper from ai_copywriter still resolve without breaking.
export { generateWordTimestamps as transcribeWithWhisper } from './audio_transcriber';
export type { TranscriptResult as WhisperTranscriptResult, WordTimestamp as WhisperWord } from './audio_transcriber';

// ── Azure OpenAI helper ───────────────────────────────────────────────────────

async function azureChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const endpoint    = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey      = process.env.AZURE_OPENAI_KEY ?? process.env.AZURE_OPENAI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY;
  const deployment  = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT_NAME_GPT4O_MINI;
  const apiVersion  = process.env.AZURE_OPENAI_API_VERSION_GPT4O_MINI || '2024-02-01';

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(`Azure OpenAI environment variables are not configured correctly. Missing: ${!endpoint ? 'ENDPOINT ' : ''}${!apiKey ? 'KEY ' : ''}${!deployment ? 'DEPLOYMENT' : ''}`);
  }

  // Ensure endpoint doesn't have trailing slash
  const base = endpoint.replace(/\/$/, '');
  const url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        temperature: 0.9,
        max_tokens: 10000,
      }),
    });
  } catch (err) {
    throw new Error(`Azure OpenAI network request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[azureChat] Error ${res.status}:`, errText);
    throw new Error(`Azure OpenAI error (${res.status}): ${errText.slice(0, 500)}`);
  }

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (parseErr) {
    console.error('[azureChat] JSON Parse Error. Raw response:', rawText);
    throw new Error(`Azure OpenAI returned invalid JSON. Content starts with: ${rawText.slice(0, 100)}`);
  }

  const raw = data.choices?.[0]?.message?.content as string | undefined;
  if (!raw) {
    console.error('[azureChat] Empty choices in response:', data);
    throw new Error('Azure OpenAI returned an empty response (no choices).');
  }

  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// ── 0. parseDraft ─────────────────────────────────────────────────────────────
// Reads the user's raw draft text and produces a structured brief.
// This brief is the single source of truth for all downstream generation.

export interface DraftBrief {
  coreClaim: string;           // the main point the user is making
  specificExamples: string[];  // concrete things they named (products, scenarios, comparisons)
  tensions: string[];          // conflicts, problems, or contrasts they described
  engagementMechanics: string[]; // CTAs, polls, challenges they described ("comment 1 or 2", etc.)
  keyPhrases: string[];        // exact language from the draft worth preserving verbatim
  suggestedAngles: string[];   // 5 distinct content angles to build from
}

export async function parseDraft(
  rawDraft: string,
  context: BusinessContext,
): Promise<DraftBrief> {
  const system = `You are a content strategist. Your job is to deeply read a creator's rough draft and extract the structured ingredients — the specific claims, examples, tensions, and language they have already written. You do not add ideas they didn't write. You surface and organize what is already there.

Output valid JSON only. No markdown, no preamble.`;

  const user = `Read this draft carefully. Extract only what the creator actually wrote — do not invent new ideas.

DRAFT:
${rawDraft}

Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}
Product/Service: ${context.productDescription}

Return a structured brief:
{
  "coreClaim": "The single main point the creator is making in one sentence",
  "specificExamples": ["exact things they named or described — products, scenarios, comparisons, before/afters"],
  "tensions": ["specific problems, failures, or conflicts they described — not generic versions"],
  "engagementMechanics": ["any CTAs, polls, challenges, or interactive elements they wrote — e.g. 'comment which looks more real: 1 or 2'"],
  "keyPhrases": ["exact phrases from the draft that are specific and worth preserving verbatim"],
  "suggestedAngles": [
    "5 distinct angles for captions — each must be grounded in something from the draft, not invented"
  ]
}`;

  const raw    = await azureChat(system, user);
  const parsed = JSON.parse(raw) as DraftBrief;
  if (!parsed.coreClaim) throw new Error('parseDraft: invalid response structure');
  return parsed;
}

// ── 1. generateHooks ─────────────────────────────────────────────────────────

function loadHookSkill(): string {
  const skillPath = join(process.cwd(), 'skills', 'hooks', 'skill.md');
  return readFileSync(skillPath, 'utf8');
}

export async function generateHooks(
  videoIdea: string,
  context: BusinessContext,
  brief?: DraftBrief,
): Promise<Array<{ id: string; text: string }>> {
  const hookSkill = loadHookSkill();

  const system = `You are a viral short-form video strategist. You write hooks for Instagram Reels that stop scrollers cold.

Read and follow these skill guidelines exactly:

${hookSkill}

Output valid JSON only. No markdown, no preamble.`;

  const briefSection = brief ? `
STRUCTURED BRIEF (extracted from the creator's draft — use these as your source):
Core claim: ${brief.coreClaim}
Specific examples: ${brief.specificExamples.join(' | ')}
Tensions: ${brief.tensions.join(' | ')}
Key phrases to draw from: ${brief.keyPhrases.join(' | ')}
` : `RAW DRAFT:\n${videoIdea}`;

  const user = `${briefSection}

Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}

Write exactly 5 hooks. Each must use a DIFFERENT viral angle AND be grounded in a specific detail, tension, or example from the brief above — not the topic category in general.

Angles (one per hook):
1. Pattern interrupt — say the opposite of what someone would expect about this specific content
2. Direct address — name the exact person this video is for, using a specific detail from the brief
3. Specific claim — include a concrete number, fact, or named thing from the brief
4. Tension/stakes — something is at risk or about to be revealed that exists in this specific content
5. Provocative question — sounds wrong or surprising based on what the brief reveals

Hard rules:
- 2–6 words per hook
- No punctuation at end
- No filler openers: "The secret", "How to", "Why you", "Here's", "This is"
- No verb + "your" constructions ("Protect your", "Transform your", "Unlock your")
- Write in the language that best matches the target audience

Return exactly:
{
  "hooks": [
    { "id": "hook_1", "text": "...", "angle": "pattern_interrupt" },
    { "id": "hook_2", "text": "...", "angle": "direct_address" },
    { "id": "hook_3", "text": "...", "angle": "specific_claim" },
    { "id": "hook_4", "text": "...", "angle": "tension" },
    { "id": "hook_5", "text": "...", "angle": "provocative_question" }
  ]
}`;

  const raw    = await azureChat(system, user);
  const parsed = JSON.parse(raw) as { hooks: Array<{ id: string; text: string; angle?: string }> };
  if (!Array.isArray(parsed.hooks) || parsed.hooks.length === 0) {
    throw new Error('generateHooks: invalid response structure');
  }
  return parsed.hooks.map(({ id, text }) => ({ id, text }));
}

// ── 2. qaHooks ───────────────────────────────────────────────────────────────

export async function qaHooks(
  hooks: Array<{ id: string; text: string }>,
): Promise<HookOption[]> {
  const hookSkill = loadHookSkill();

  const system = `You are a viral content analyst who scores hooks with brutal precision. Output valid JSON only.

Use the following skill guidelines as your scoring standard:

${hookSkill}

Be harsh — most hooks score 4–7. Only genuinely scroll-stopping hooks hit 8+. Apply every penalty rule listed above before assigning a final score.`;

  const user = `Score each of these hooks:
${JSON.stringify(hooks)}

For each hook return:
- spellingOk: every word spelled correctly?
- wordCount: count the words
- score: 1–10 using the rubric above. Apply all penalties. Be harsh — most hooks score 4–7. Only exceptional hooks hit 8+.
- correctedText: only include if spelling needs fixing

Return:
{
  "scored": [
    {
      "id": "hook_1",
      "spellingOk": true,
      "wordCount": 4,
      "score": 7
    }
  ]
}`;

  const raw    = await azureChat(system, user);
  const parsed = JSON.parse(raw) as {
    scored: Array<{
      id: string;
      spellingOk: boolean;
      wordCount: number;
      score: number;
      correctedText?: string;
    }>;
  };

  if (!Array.isArray(parsed.scored)) throw new Error('qaHooks: invalid response structure');

  const scored: HookOption[] = parsed.scored.map((s) => {
    const original = hooks.find((h) => h.id === s.id);
    const text = s.correctedText ?? original?.text ?? '';
    return {
      id:            s.id,
      text,
      score:         s.score,
      spellingOk:    s.spellingOk,
      wordCount:     s.wordCount,
      isRecommended: false,
    };
  });

  const best = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);
  best.isRecommended = true;

  return scored;
}

// ── 3. generateCaptions ──────────────────────────────────────────────────────

export async function generateCaptions(
  selectedHookText: string,
  videoIdea: string,
  context: BusinessContext,
  brief?: DraftBrief,
): Promise<Array<{ id: string; text: string; format: string }>> {
  const system = `You are a skilled Instagram copywriter hired to write captions for a creator. The creator gave you their rough notes — specific claims, examples, tensions, and language they want to use. Your job is to take those ingredients and craft 5 compelling, distinctly styled captions that a real person would stop scrolling to read.

You write with craft. Your sentences have rhythm. Your structure breathes. You know that a great Instagram caption feels personal, specific, and alive — not polished-to-death corporate copy.

THE CREATOR'S NOTES ARE YOUR ONLY SOURCE MATERIAL:
Do not invent facts, steps, or comparisons the creator didn't mention. If they wrote "rubbery-looking AI images", use that exact language. If they wrote "comment 1 or 2", that mechanic goes in. Their specific details are what make the caption feel real — generic versions of those details kill it.

But "don't invent facts" does NOT mean "transcribe mechanically". You have full creative license to:
→ Find the emotional truth in what they wrote and lead with that
→ Develop their examples into vivid, relatable scenes
→ Use rhythm, pacing, and sentence variation to make it engaging
→ Choose the best order to present their ideas — don't just follow their draft order
→ Add texture through specific observations that are implied by what they wrote

VISUAL STRUCTURE IS NON-NEGOTIABLE:
Every caption must breathe. Instagram captions read on phones — walls of text get scrolled past. Use:
→ Short standalone lines for emotional impact (one thought per line)
→ Blank lines (\\n\\n) between every distinct thought or section
→ Emojis as visual anchors at the start of key lines (3–6 per caption, never at end of lines)
→ Questions mid-caption or at end to invite replies
→ Rhythm: mix short punchy lines with slightly longer ones — never the same length twice in a row
→ A specific comment CTA as the final standalone line

THE 5 OPTIONS — EACH A DISTINCT WRITING APPROACH:
Option A — Direct and punchy. Short declarative sentences. Every line lands like a statement. No fluff, no hedging. The kind of caption that sounds like someone who's been there and is done explaining themselves. 3–4 emojis as anchors.
Option B — Story-driven. Pull the reader into a specific moment. The creator's facts arrive through a scene — something the reader recognizes from their own life. Ends with "if this is you" + comment CTA.
Option C — Structured breakdown. The creator's content as a clear visual journey — each idea introduced with a punchy line, then expanded in 1–2 sentences, then separated by a blank line. Feels organized and satisfying to read.
Option D — Conversational. Reads like a voice note. Casual rhythm, mid-sentence questions, parentheticals, self-interruptions. The creator talking directly to one person. Very low formality, high intimacy.
Option E — Engagement-first. Entire caption is built around drawing the reader into participation. Sets up the stakes in the first 2 lines, then drives everything toward the specific engagement mechanic the creator described (poll, "comment 1 or 2", challenge). Every line earns the CTA.

QUALITY STANDARDS — meet all of these:
- First line creates immediate tension, curiosity, or recognition — cannot start with "I", the brand name, or soft openers ("Have you ever", "Are you")
- Every caption must be 400–900 words. Short captions = rejected and wrong. The video is short — the description IS the content. People come to read it. Give them something worth reading.
- Each option must feel unmistakably different from the others — not just different word choices, but different emotional register, different pacing, different structure
- No **bold markdown** (Instagram doesn't render it — looks broken)
- No numbered lists (1. 2. 3.) — use visual spacing and line breaks instead
- CTA is the last line, standalone, specific — not "follow for more", not "save this post"

Banned phrases: "game-changer", "unlock", "transform your", "dive into", "in today's world", "the truth is", "let's be honest", "here's the thing", "it's no secret", "level up", "don't miss out".

Output valid JSON only. No markdown wrapping, no preamble. Use \\n for single line breaks and \\n\\n for paragraph breaks in the text values.`;

  const briefSection = brief ? `CREATOR'S BRIEF (structured from their exact notes — these are your only ingredients):
Core claim: ${brief.coreClaim}
Specific examples they named: ${brief.specificExamples.join(' | ')}
Problems/tensions they described: ${brief.tensions.join(' | ')}
Engagement mechanics they wrote: ${brief.engagementMechanics.length > 0 ? brief.engagementMechanics.join(' | ') : 'none specified'}
Key phrases to preserve verbatim: ${brief.keyPhrases.join(' | ')}` : `CREATOR'S DRAFT:\n${videoIdea}`;

  const user = `${briefSection}

Hook on screen: "${selectedHookText}"
Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}
Product/Service: ${context.productDescription}

Write 5 captions — each 400–900 words, each with a completely different feel and structure. All 5 draw from the same creator brief but should sound like they were written for different formats and emotional registers.

Before you write each caption, ask yourself: "Would someone who sees this caption feel like they're reading something real and specific — or something generic?" If generic: rewrite it.

Make each one look different on a phone screen — different line break patterns, different emoji placement, different pacing. If two captions feel similar in structure, they're wrong.

Return:
{
  "captions": [
    { "id": "caption_1", "wordCount": 0, "text": "...", "format": "A" },
    { "id": "caption_2", "wordCount": 0, "text": "...", "format": "B" },
    { "id": "caption_3", "wordCount": 0, "text": "...", "format": "C" },
    { "id": "caption_4", "wordCount": 0, "text": "...", "format": "D" },
    { "id": "caption_5", "wordCount": 0, "text": "...", "format": "E" }
  ]
}`;

  const raw    = await azureChat(system, user);
  const parsed = JSON.parse(raw) as { captions: Array<{ id: string; text: string; format: string }> };
  if (!Array.isArray(parsed.captions) || parsed.captions.length === 0) {
    throw new Error('generateCaptions: invalid response structure');
  }
  return parsed.captions;
}

// ── 4. qaCaptions ────────────────────────────────────────────────────────────

export async function qaCaptions(
  captions: Array<{ id: string; text: string; format: string }>,
  context: BusinessContext,
): Promise<CaptionOption[]> {
  const system = `You are a strict Instagram content editor. Your job is to reject weak captions and score the good ones. Output valid JSON only.

SCORING CRITERIA (1–10):
9–10: Reads human, specific, has a CTA you would actually tap. Hard to improve.
7–8: Solid structure, clear value, functional CTA.
5–6: Generic or templated. Works but won't stand out.
3–4: Weak CTA, vague content, or sounds like marketing copy.
1–2: No CTA, banned phrases, or formatted like a numbered list.

HARD RULE: If a caption fails more than 2 checks, cap score at 3.`;

  const user = `Score these captions against these rules:
1. noMarkdown — no **bold** markdown or numbered lists (1. 2. 3.) — emojis and line breaks are fine and encouraged
2. noForbiddenPhrases — none of: "game-changer", "unlock", "transform your", "dive into", "in today's world", "the truth is", "let's be honest", "here's the thing", "level up", "don't miss out"
3. firstLineStrong — first line creates curiosity or tension (not starting with "I", brand name, or weak question)
4. hasCTA — clear specific CTA in the last standalone line (not "follow for more")
5. spellingOk — every word spelled correctly
6. toneMatch — tone matches "${context.tone}" for audience "${context.targetAudience}"
7. isLongEnough — caption is at least 400 words. The video is short; the description carries the content. Captions under 400 words fail this check automatically.

Captions:
${JSON.stringify(captions.map(c => ({ id: c.id, text: c.text })))}

Return:
{
  "scored": [
    {
      "id": "caption_1",
      "spellingOk": true,
      "hasCTA": true,
      "toneMatch": true,
      "noForbiddenPhrases": true,
      "noMarkdown": true,
      "firstLineStrong": true,
      "isLongEnough": true,
      "score": 8,
      "failReasons": [],
      "correctedText": "..."
    }
  ]
}
Omit correctedText if no corrections needed.`;

  const raw    = await azureChat(system, user);
  const parsed = JSON.parse(raw) as {
    scored: Array<{
      id: string;
      spellingOk: boolean;
      hasCTA: boolean;
      toneMatch: boolean;
      noForbiddenPhrases: boolean;
      noMarkdown: boolean;
      firstLineStrong: boolean;
      score: number;
      failReasons: string[];
      correctedText?: string;
    }>;
  };

  if (!Array.isArray(parsed.scored)) throw new Error('qaCaptions: invalid response structure');

  return parsed.scored.map((s) => {
    const original = captions.find((c) => c.id === s.id);
    const text = s.correctedText ?? original?.text ?? '';
    return {
      id:                 s.id,
      text,
      format:             original?.format ?? '',
      score:              s.score,
      spellingOk:         s.spellingOk,
      hasCTA:             s.hasCTA,
      toneMatch:          s.toneMatch,
      noForbiddenPhrases: s.noForbiddenPhrases,
      noMarkdown:         s.noMarkdown,
      firstLineStrong:    s.firstLineStrong,
      skillScore:         0,   // filled in by validateAgainstSkill
      isRecommended:      false,
    };
  });
}

// ── 5. validateAgainstSkill ──────────────────────────────────────────────────

function loadDescriptionSkill(): string {
  const skillPath = join(process.cwd(), 'skills', 'descriptions', 'skill.md');
  return readFileSync(skillPath, 'utf8');
}

export async function validateAgainstSkill(
  captions: CaptionOption[],
  context: BusinessContext,
): Promise<CaptionOption[]> {
  const skillContent = loadDescriptionSkill();

  const system = `You are a structural caption editor. Your job is to fix formatting violations only — never rewrite for style, never reduce length, never remove the writer's specific examples, language, or scenarios.

WHAT YOU FIX (structural issues only):
- Remove any **bold markdown** (keep the text, remove the asterisks)
- Remove numbered lists (1. 2. 3.) — rewrite as visually spaced prose blocks instead
- Fix spelling errors in place
- Add a CTA if genuinely missing (match the tone and subject — do not use generic CTAs)
- Fix a weak first line ONLY if it starts with "I", the brand name, or a soft question opener

WHAT YOU NEVER DO:
- Do not shorten captions. If a caption is 250 words, the improved version must be at least 250 words.
- Do not remove emojis — they are intentional visual anchors.
- Do not remove line breaks or compress paragraphs — visual spacing is intentional.
- Do not remove specific examples, named scenarios, or unique phrasing from the original.
- Do not rewrite for "cleaner" style — preserve the voice and visual structure.
- If a caption passes all structural checks, return it exactly as-is.

SKILL GUIDELINES (for scoring reference only):
${skillContent}

Output valid JSON only.`;

  const user = `Check these captions for structural violations only.
Business: "${context.businessName}", Tone: "${context.tone}", Audience: "${context.targetAudience}"

${JSON.stringify(captions.map(c => ({ id: c.id, text: c.text })))}

For each caption:
- List any structural violations found (numbered lists, bullet points, bold markdown, missing CTA, weak first line)
- If violations exist, return improvedText that fixes ONLY those violations — preserve everything else exactly
- Score 1–10 based on skill guidelines

Return:
{
  "validated": [
    {
      "id": "caption_1",
      "passesSkill": true,
      "skillIssues": [],
      "skillScore": 9,
      "improvedText": "..."
    }
  ]
}
Omit improvedText if no structural violations found.`;

  const raw    = await azureChat(system, user);
  const parsed = JSON.parse(raw) as {
    validated: Array<{
      id: string;
      passesSkill: boolean;
      skillIssues: string[];
      skillScore: number;
      improvedText?: string;
    }>;
  };

  if (!Array.isArray(parsed.validated)) throw new Error('validateAgainstSkill: invalid response');

  return captions.map((caption) => {
    const v = parsed.validated.find((x) => x.id === caption.id);
    if (!v) return caption;
    const text       = v.improvedText ?? caption.text;
    const skillScore = v.skillScore;
    const mergedScore = Math.round((caption.score + skillScore) / 2);
    return { ...caption, text, skillScore, score: mergedScore };
  });
}

// ── 6. generateHashtags ──────────────────────────────────────────────────────

export async function generateHashtags(
  hook: string,
  caption: string,
  context: BusinessContext,
): Promise<string[]> {
  const system = `You are a hashtag strategist. Output valid JSON only — no markdown, no preamble.`;

  const bannedTags = '#love #instagood #follow #like #photooftheday #beautiful #happy #fashion #instagram #art';

  const user = `Generate exactly 5 niche-specific hashtags for this reel.
Hook: "${hook}"
Caption excerpt: "${caption.slice(0, 200)}"
Business: ${context.businessName}
Audience: ${context.targetAudience}

Rules:
- No generic tags. Banned: ${bannedTags}
- Niche-specific and audience-relevant
- Mix: 1–2 large (500k–2M posts), 2–3 medium (50k–500k), 0–1 small (<50k)
- Return in the language of the audience

Return:
{ "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"] }`;

  const raw    = await azureChat(system, user);
  const parsed = JSON.parse(raw) as { hashtags: string[] };
  if (!Array.isArray(parsed.hashtags)) throw new Error('generateHashtags: invalid response');
  return parsed.hashtags.slice(0, 5);
}
