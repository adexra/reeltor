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

// ── 1. generateHooks ─────────────────────────────────────────────────────────

function loadHookSkill(): string {
  const skillPath = join(process.cwd(), 'skills', 'hooks', 'skill.md');
  return readFileSync(skillPath, 'utf8');
}

export async function generateHooks(
  videoIdea: string,
  context: BusinessContext,
): Promise<Array<{ id: string; text: string }>> {
  const hookSkill = loadHookSkill();

  const system = `You are a viral short-form video strategist. You write hooks for Instagram Reels that stop scrollers cold.

Read and follow these skill guidelines exactly:

${hookSkill}

Output valid JSON only. No markdown, no preamble.`;

  const user = `VIDEO CONTENT (this is the only raw material you have — every hook must come from something specific in here):
${videoIdea}

Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}

Write exactly 5 hooks. Each must use a DIFFERENT viral angle AND be grounded in a specific detail, tension, or contrast from the video content above — not the topic category in general.

Angles (one per hook):
1. Pattern interrupt — say the opposite of what someone would expect about this specific content
2. Direct address — name the exact person this video is for, using a specific detail from the content
3. Specific claim — include a concrete number, fact, or named thing from the content
4. Tension/stakes — something is at risk or about to be revealed that exists in this specific content
5. Provocative question — sounds wrong or surprising based on what this specific content reveals

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
): Promise<Array<{ id: string; text: string; format: string }>> {
  const system = `You are a viral Instagram caption writer. The user has already done the creative thinking — they wrote a topic brief with specific ideas, angles, contrasts, and examples. Your job is to take that raw material and elevate it into 5 rich, human, fully-developed captions. You are an editor and amplifier, not a rewriter.

TREAT THE TOPIC AS SACRED: The user's specific language, examples, contrasts, and scenarios must survive into the final captions. If they wrote "rubbery-looking AI images", that phrase or its meaning must appear. If they described a specific scenario ("leave a comment: option 1 or 2"), that mechanic must be honored. Do not swap their specifics for generic equivalents.

THE CARDINAL RULE: Every caption must be rooted in the exact subject matter from the topic — not the category it belongs to. If two captions could swap content, you failed.

Length requirement: Each caption must be 150–350 words (roughly 1000–2000 characters). This is not optional. Short captions fail the user's audience who came to read. Count your words before returning. If a caption is under 150 words, expand it with more specific detail from the topic. You have room to go long — use it.

Structural rules (non-negotiable):
- First line: cannot start with "I", the brand name, or a soft question ("Have you ever", "Are you"). Must create tension, curiosity, or a sharp claim.
- Body: short paragraphs (2–3 sentences max), then a line break. No walls of text.
- No numbered lists, no bullet points, no bold markdown (**text**). Instagram renders none of these.
- Emojis: 1–2 max, purposeful, never decorative.
- CTA: last line, standalone, low-friction, specific. Must relate to the specific content — not generic "follow for more".

Voice: one person talking to one other person. Conversational. Someone who actually does this, not a brand account.

Banned phrases (instant fail): "game-changer", "unlock", "transform your", "dive into", "in today's world", "the truth is", "let's be honest", "here's the thing", "it's no secret", "level up", "don't miss out", "Start building your workflow today".

Output valid JSON only. No markdown wrapping, no preamble.`;

  const user = `TOPIC (the user's raw brief — preserve their specific language, examples, and angles):
${videoIdea}

Hook on screen: "${selectedHookText}"
Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}
Product/Service: ${context.productDescription}

Step 1 — Identify the 5 most specific angles already present in the topic above. These are tensions, contrasts, scenarios, or examples the user actually wrote — not generic versions. Name them explicitly.

Step 2 — Write one caption per angle. Each must use a DIFFERENT emotional entry point and must preserve the specific detail from that angle:

Caption 1 — The problem made visceral. Open with the specific failure the user described. Show the mechanism — why does this happen, what does it feel like. Build to the relief. End with a "this is fixable" style CTA tied to the specific product/scenario.

Caption 2 — The turning point. Drop into a specific moment from the topic where something shifted. The before, what changed, the after. No vague revelations — name what specifically changed and why it mattered. End with "if this is you" CTA.

Caption 3 — The counterintuitive truth. Open with a claim from the topic that sounds wrong or surprising. Systematically explain why the obvious approach fails, then reveal the real mechanism. Each paragraph adds a new layer of the same specific insight. End with a question CTA that invites the reader to reflect.

Caption 4 — The how-to with teeth. Open with a sharp, specific claim. Walk through the actual method using the specific details from the topic — real steps, named things, concrete examples. This is the process itself, not tips about the process. End with a save CTA.

Caption 5 — The contrast reveal. Use any engagement mechanic the user described (e.g. "comment which looks more real: 1 or 2", a before/after, a test). Build suspense around the contrast, deliver the reveal with specifics, close with the insight. End with the engagement CTA from the topic.

Use \\n\\n between every paragraph. No numbered lists, no bullet points, no bold markdown. Each caption must be 150–350 words — check your count before returning. Go long where the content supports it.

Return:
{
  "angles": ["angle 1", "angle 2", "angle 3", "angle 4", "angle 5"],
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
1. noMarkdown — no numbered lists, bullet points, or **bold** markdown
2. noForbiddenPhrases — none of: "game-changer", "unlock", "transform your", "dive into", "in today's world", "the truth is", "let's be honest", "here's the thing", "level up", "don't miss out"
3. firstLineStrong — first line creates curiosity or tension (not starting with "I", brand name, or weak question)
4. hasCTA — clear specific CTA in the last standalone line (not "follow for more")
5. spellingOk — every word spelled correctly
6. toneMatch — tone matches "${context.tone}" for audience "${context.targetAudience}"

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
- Remove any numbered lists or bullet points (rewrite as prose sentences)
- Remove any **bold markdown** (keep the text, remove the asterisks)
- Fix spelling errors in place
- Add a CTA if genuinely missing (match the tone and subject — do not use generic CTAs)
- Fix a weak first line ONLY if it starts with "I", the brand name, or a soft question opener

WHAT YOU NEVER DO:
- Do not shorten captions. If a caption is 250 words, the improved version must be at least 250 words.
- Do not remove specific examples, named scenarios, or unique phrasing from the original.
- Do not swap the writer's concrete language for generic summaries.
- Do not rewrite for "cleaner" style — preserve the voice.
- If a caption passes all structural checks, return it exactly as-is. Do not improve what isn't broken.

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
