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
        max_tokens: 3000,
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
  const system = `You are a viral Instagram caption writer. Your only job is to turn the specific content from the user's topic into 5 captions that each feel like they were written by a different person on a different day.

THE CARDINAL RULE: Every caption must be rooted in the exact subject matter provided — not the category it belongs to, not a generic version of it. The specific thing. If the topic is about AI image prompts that avoid rubbery results, the caption must talk about rubbery results, real-world physics in prompts, what bad prompts actually produce — not just "AI tools" or "visuals" in the abstract.

Before writing, extract 5 distinct angles from the topic. Each caption uses a DIFFERENT angle. If two captions could swap content, you failed.

Structural rules (non-negotiable):
- First line: cannot start with "I", the brand name, or a soft question ("Have you ever", "Are you"). Must create tension, curiosity, or a sharp claim.
- Body: 150–300 words of real, specific content. Short paragraphs (2–3 sentences max), then a line break.
- No numbered lists, no bullet points, no bold markdown (**text**). Instagram renders none of these.
- Emojis: 1–2 max, purposeful, never decorative.
- CTA: last line, standalone, low-friction, specific.

Voice: one person talking to one other person. Conversational. Not a brand. Not a coach.

Banned phrases (instant fail): "game-changer", "unlock", "transform your", "dive into", "in today's world", "the truth is", "let's be honest", "here's the thing", "it's no secret", "level up", "don't miss out", "Start building your workflow today".

Output valid JSON only. No markdown wrapping, no preamble.`;

  const user = `TOPIC — mine this for every specific detail, contrast, example, and tension point:
${videoIdea}

Hook on screen: "${selectedHookText}"
Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}
Product/Service: ${context.productDescription}

Step 1 — Extract 5 different angles from the topic above. Each must be a specific tension, insight, story beat, or contrast that exists in the topic. Not the generic category — the actual thing.

Step 2 — Write one caption per angle. Each uses a DIFFERENT perspective and emotional entry point:

Caption 1 — The problem made visceral. Open with the specific failure mode from the topic. Deliver the mechanism behind why it happens. End with a "this is fixable" style CTA.

Caption 2 — The turning point. Drop into the middle of a specific moment where something shifted. What changed, why, what it led to. Concrete — no vague epiphanies. End with "if this is you" CTA.

Caption 3 — The counterintuitive truth. Open with a claim that sounds wrong. Explain why the obvious approach fails and what the non-obvious fix actually is. Each paragraph reveals a new layer. End with a question CTA.

Caption 4 — The how-to with teeth. Open with a sharp statement. Walk through the actual method — specific steps, real examples, named details from the topic. Not tips. The actual process. End with a save CTA.

Caption 5 — The honest take. Written like someone who tried the wrong way first, figured it out, and is passing it on. Specific mistakes named. Specific lesson extracted. End with a direct action CTA.

Use \\n\\n between every paragraph. No numbered lists, no bullet points, no bold markdown.

Return:
{
  "angles": ["angle 1", "angle 2", "angle 3", "angle 4", "angle 5"],
  "captions": [
    { "id": "caption_1", "text": "...", "format": "A" },
    { "id": "caption_2", "text": "...", "format": "B" },
    { "id": "caption_3", "text": "...", "format": "C" },
    { "id": "caption_4", "text": "...", "format": "D" },
    { "id": "caption_5", "text": "...", "format": "E" }
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

  const system = `You are a content validator. Read the following caption skill guidelines and validate each caption against them. Output valid JSON only.

SKILL GUIDELINES:
${skillContent}`;

  const user = `Validate these captions against the skill guidelines above.
Business: "${context.businessName}", Tone: "${context.tone}", Audience: "${context.targetAudience}"

${JSON.stringify(captions.map(c => ({ id: c.id, text: c.text })))}

For each caption return:
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
Omit improvedText if no issues found.`;

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
