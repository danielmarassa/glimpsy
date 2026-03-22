export const config = { runtime: 'edge' };

const CLAUDE_PROMPT = `You are a children's content analyst for Glimpsy, a family content curation platform.

Analyse the following title and return a JSON content assessment.
Be conservative — when in doubt, score higher (more caution) rather than lower.
Base your assessment on the synopsis, age rating, genre, and any known information about this title.

TITLE: {{title}}
TYPE: {{type}}
SYNOPSIS: {{synopsis}}
AGE RATING: {{age_rating}}
GENRES: {{genres}}
ADDITIONAL CONTEXT: {{extra}}

Return ONLY a valid JSON object with exactly this structure — no preamble, no explanation:

{
  "violence": 0,
  "fear_fantasy": 0,
  "fear_realistic": 0,
  "language_mild": 0,
  "language_frequency": 0,
  "sex_nudity": 0,
  "social_safety": 0,
  "positive_messages": 0,
  "role_models": 0,
  "consumerism": 0,
  "drink_drugs": 0,
  "sensory_index": 0,
  "themes": [],
  "age_recommendation": "",
  "one_line_summary": ""
}

SCORING GUIDE — use 0–5 for all numeric fields:

violence:
  0 = None  1 = Cartoon slapstick only  2 = Mild action, no injury
  3 = Some combat or injury — not graphic  4 = Strong violence, serious injury
  5 = Graphic or sustained violence

fear_fantasy (cartoon/fantasy threat — monsters, witches, imaginary danger):
  0 = Nothing scary  1 = Mild fantasy peril  2 = Some fantasy scary moments
  3 = Genuinely frightening fantasy  4 = Very frightening — may cause nightmares
  5 = Extreme fantasy horror

fear_realistic (real-world threat — danger, injury, death):
  0 = No realistic threat  1 = Mild real-world tension  2 = Some realistic peril, resolves safely
  3 = Genuinely frightening realistic sequences  4 = Very frightening realistic content
  5 = Extreme realistic threat

language_mild (severity of worst language):
  0 = None  1 = Very mild (stupid, idiot)  2 = Mild occasional moderate words
  3 = Moderate  4 = Strong  5 = Very strong / discriminatory

language_frequency:
  0 = None  1 = Single instance  2 = Occasional  3 = Recurring  4 = Frequent  5 = Constant

sex_nudity:
  0 = None  1 = Innocent romance  2 = Kissing  3 = Suggestive  4 = Partial nudity  5 = Explicit

social_safety (bullying, exclusion, peer harm):
  0 = No social harm  1 = Minor friction, resolves positively  2 = Some bullying shown, addressed
  3 = Bullying present, not always resolved  4 = Significant bullying, normalised
  5 = Severe — bullying glorified or unpunished

positive_messages:
  0 = None  1 = Minimal  2 = Some positive themes  3 = Good positive messages
  4 = Strong throughout  5 = Exceptional — core theme is kindness/empathy/learning

role_models:
  0 = None  1 = Weak/absent  2 = Mixed  3 = Generally positive
  4 = Strong  5 = Exceptional

consumerism:
  0 = None  1 = Minimal brand awareness  2 = Some product placement
  3 = Noticeable commercial messaging  4 = Heavy product placement
  5 = Entire premise is commercial

drink_drugs:
  0 = None  1 = Brief reference  2 = Alcohol shown normalised
  3 = Drinking/smoking depicted positively  4 = Drug/alcohol use in detail
  5 = Glorified substance use

sensory_index (1–5, where 5 = very calm, 1 = very stimulating):
  5 = Very calm — slow pace, simple narrative, minimal cuts, muted colours
  4 = Mostly calm — gentle pace, predictable structure
  3 = Moderate — average children's content
  2 = Quite stimulating — fast cuts, loud music, high energy
  1 = Very stimulating — rapid editing, intense colours, overwhelming pace

themes — pick all that apply:
  Positive: positive-friendship, positive-empathy, family-values, educational,
            social-skills, special-interests, sensory-friendly, clear-narrative,
            repetitive-structure, positive-role-models
  Neutral/Warning: toilet-humour, mild-violence, family-conflict, divorce,
                   bullying, grief, scary, mild-peril, fantasy-threat, realistic-threat
  Sensitive: death, monsters, guns, loud-music, flashing-lights, sensory-overload,
             cyberbullying, social-exclusion

age_recommendation: short string like "3+" or "6–9" or "All ages"

one_line_summary: one sentence max 20 words describing content for parents — address the parent, never the child`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await req.json();

  // Support both old format (raw messages) and new format (structured fields)
  let messages;
  if (body.messages) {
    // Legacy passthrough — keep working as before
    messages = body.messages;
  } else {
    // New structured format
    const prompt = CLAUDE_PROMPT
      .replace('{{title}}', body.title || '')
      .replace('{{type}}', body.type || 'tv')
      .replace('{{synopsis}}', body.synopsis || '')
      .replace('{{age_rating}}', body.age_rating || 'Unknown')
      .replace('{{genres}}', (body.genres || []).join(', '))
      .replace('{{extra}}', body.extra || '');

    messages = [{ role: 'user', content: prompt }];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages
    })
  });

  const data = await res.json();

  // If using new structured format, parse and return clean JSON
  if (!body.messages) {
    const rawText = data?.content?.[0]?.text || '';
    const clean = rawText.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(clean);
      return new Response(JSON.stringify(parsed), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to parse Claude response', raw: rawText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
