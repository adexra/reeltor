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

export async function generateHooks(
  videoIdea: string,
  context: BusinessContext,
): Promise<Array<{ id: string; text: string }>> {
  const system = `You are a viral short-form video strategist. You write hooks for Instagram Reels that stop scrollers cold. A hook appears as a 2–6 word text overlay in the first second of the video.

WHAT MAKES A HOOK VIRAL:
- It opens a curiosity gap — the viewer MUST watch to get the answer
- It makes a bold or counterintuitive claim
- It speaks directly to the viewer's pain, desire, or identity
- It uses the video's specific content — NOT generic descriptions of what the video is about

WHAT KILLS A HOOK (never do these):
- Generic topic summaries ("How to travel better", "Morning routine tips")
- Filler openers ("The secret to", "How I", "Why you should", "Here's")
- Verb + "your" constructions ("Protect your", "Transform your", "Unlock your", "Boost your") — max score 5
- Self-help book titles ("Protect your sanity", "Master your mindset") — max score 5
- Vague claims that apply to any niche ("This changed everything") — max score 4
- More than 7 words — max score 6

REWARD these:
- Hooks specific to the audience's exact situation
- Counterintuitive or slightly controversial ("Stop optimizing your morning")
- Something overheard in conversation, not written for an ad
- Knowledge gap ("Why your X is actually Y")

Output valid JSON only.`;

  const user = `Write exactly 5 hooks for a reel about:
Video content: ${videoIdea}
Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}

Each hook must use a DIFFERENT viral angle:
1. Pattern interrupt — says the opposite of what people expect
2. Direct address — calls out the viewer by their specific situation
3. Specific claim — a precise, bold, verifiable-sounding statement (must use a number or concrete detail)
4. Tension/stakes — something will be lost or revealed if they don't watch
5. Provocative question — sounds wrong or surprising, demands an answer

Rules:
- 2 to 6 words per hook
- No punctuation at end
- No filler openers: "The secret", "How to", "Why you", "This is", "Here's"
- No verb + "your" ("Protect your...", "Transform your...")
- Every hook grounded in the SPECIFIC video content, not the topic category
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
  const system = `You are a viral content analyst who has studied 10,000+ high-performing Reels. You score hooks with brutal precision. Output valid JSON only.

SCORING RUBRIC (1–10):
9–10: Stops anyone mid-scroll. Creates a gap the viewer MUST close. Specific, not generic.
7–8: Strong curiosity or tension. Specific to the content. Would perform well.
5–6: Adequate but forgettable. Applies to any video on this topic.
3–4: Generic. Sounds like a topic title. No tension or curiosity.
1–2: Actively bad. Filler, vague, or bragging without stakes.

MANDATORY PENALTIES — apply before scoring:
- Verb + "your" construction ("Protect your", "Transform your", "Unlock your"): cap score at 5
- Sounds like a self-help book title: cap score at 5
- Could describe 100 other videos on this topic: subtract 3
- Filler opener used ("The secret to", "How to", "Why you should"): subtract 2
- No curiosity gap or tension of any kind: subtract 2
- More than 7 words: cap score at 6`;

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
  const system = `You are a viral Instagram Reels caption writer. This is critical context: the reel is only 5 seconds long. The hook on-screen tells viewers to read the description. THE CAPTION IS THE CONTENT. People tap "more" specifically to get the value, the steps, the story, the tips. A short caption defeats the entire purpose of the reel.

EVERY caption must be LONG and DENSE with real, specific, actionable content. Think 150–300 words per caption. Not a summary. The full thing.

Caption structure rules:
- First line: must create immediate tension or curiosity — it's what shows before "more" is tapped
- Body: this is where you DELIVER. Real steps. Concrete tips. Specific situations. Named examples. The reader came here for substance — give it to them.
- Each paragraph: 2–3 sentences max, then a line break. Never a wall of text.
- No numbered lists. No bullet points. No bold markdown (**text**). Instagram doesn't render any of these.
- Emojis: 1–2 max total, used purposefully, never decorative.
- CTA: last line, standalone, specific action.

Voice: one human talking directly to one other person. Not a brand. Not a coach. Someone who actually does this.

Never use: "game-changer", "unlock", "transform your", "dive into", "in today's world", "the truth is", "let's be honest", "here's the thing", "it's no secret", "level up", "don't miss out", "Start building your workflow today".

Output valid JSON only. No markdown wrapping, no preamble.`;

  const user = `The hook for this reel is: "${selectedHookText}"
Business: ${context.businessName}
Audience: ${context.targetAudience}
Tone: ${context.tone}
Product/Service: ${context.productDescription}
Video idea: ${videoIdea}

Write 5 long Instagram captions. Each should be 150–300 words of real, specific content that delivers on the promise of the hook. The reel is 5 seconds — the caption does all the heavy lifting.

Use a DIFFERENT format for each — but all must be LONG and SUBSTANTIVE:

Format A: Leads with a bold statement. Then delivers 4–6 concrete, specific tips or steps written as short paragraphs (not lists). Ends with a direct CTA.

Format B: Opens with a relatable situation or moment. Tells the story of what went wrong, what changed, what they learned. Specific details. Ends with "if this is you" style CTA.

Format C: Opens with a counterintuitive claim. Explains WHY in 3–4 short paragraphs, each a complete thought. Each paragraph reveals something new. Ends with a question CTA.

Format D: Drops straight into a specific scene ("It was [specific time/situation]..."). Narrates what happened. Pulls out the lesson in the last third. Ends with a save or share CTA.

Format E: Written as a sequence of moments or revelations — each paragraph is one insight or step, written in prose (not a list). 5–7 paragraphs. Ends with CTA.

Use \\n\\n between every paragraph. No numbered lists, no bullet points, no bold markdown.

Return:
{
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
