export const config = { runtime: 'edge' };

const GEMINI_PROMPT = `You are a children's content analyst for Glimpsy, a family content curation platform.

Watch this video trailer and return a JSON sensory and visual assessment.
Be precise — base ALL scores on what you actually observe in the video, not assumptions.
All numeric scores must be integers between 0 and 5.

TITLE: {{title}}
TYPE: {{type}}

Return ONLY a valid JSON object with exactly this structure — no preamble, no explanation:

{
  "sensory_index": {
    "overall_score": 0,
    "scene_cuts_per_minute": 0,
    "colour_intensity": 0,
    "edit_pace": 0,
    "audio_stress_level": 0
  },
  "flags": {
    "loud_sudden_sounds": false,
    "flashing_lights": false,
    "orienting_reflex": false,
    "violence_detected": false,
    "scary_content_detected": false,
    "dangerous_stunts": false
  },
  "visual_justifications": {
    "note": ""
  },
  "sensory_notes": ""
}

SCORING GUIDE — all numeric scores must be integers 0–5:

scene_cuts_per_minute:
  Score 0 = ≤1.7 actual SCPM — educational baseline
  Score 1 = 1.8–2.5 actual SCPM — slow, gentle
  Score 2 = 2.6–3.0 actual SCPM — approaching rapid threshold
  Score 3 = 3.1–4.0 actual SCPM — rapid zone
  Score 4 = 4.1–5.4 actual SCPM — high stimulation
  Score 5 = ≥5.5 actual SCPM — SpongeBob baseline, acute EF impairment

colour_intensity (0–5):
  0 = Greyscale or near-monochrome
  1 = Very muted, pastel, natural tones
  2 = Soft colours, mostly gentle palette
  3 = Normal children's content colour range
  4 = Vivid, saturated colours throughout
  5 = Extremely bright, neon, highly saturated

edit_pace (0–5):
  0 = Static — almost no cuts or movement
  1 = Very slow — long held shots
  2 = Gentle pace — slow cuts, relaxed rhythm
  3 = Moderate — average children's TV pace
  4 = Fast — quick cuts, energetic rhythm
  5 = Very fast — rapid fire editing

audio_stress_level (0–5):
  0 = Silent or near-silent
  1 = Structured & predictable — soft rhythmic music, calm voices
  2 = Moderate — normal dialogue, predictable audio
  3 = Complex/layered — fast dialogue, multiple audio streams
  4 = High volume sustained — loud but continuous
  5 = Sudden & unpredictable — jump scares, crashes, unexpected loud sounds
  ALWAYS flag loud_sudden_sounds=true for ANY sudden audio shock.

overall_score (0–5 where 5 = very calm, 0 = very stimulating):
  Combine scene_cuts, colour_intensity, edit_pace and audio_stress_level.
  5 = Very calm, 4 = Mostly calm, 3 = Moderate, 2 = Quite stimulating,
  1 = Very stimulating, 0 = Extremely stimulating

orienting_reflex: true if looming objects, sudden brightness spikes, or objects appearing suddenly at frame edge

visual_justifications.note: if ANY score is 3 or above, one sentence explaining why. Empty string otherwise.

sensory_notes: one sentence describing the overall sensory experience.`;

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

  const { youtubeUrl, title, type } = await req.json();

  if (!youtubeUrl) {
    return new Response(JSON.stringify({ error: 'youtubeUrl is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const prompt = GEMINI_PROMPT
    .replace('{{title}}', title || 'Unknown')
    .replace('{{type}}', type || 'tv');

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                fileData: {
                  fileUri: youtubeUrl,
                  mimeType: 'video/mp4'
                }
              },
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000
        }
      })
    }
  );

  const geminiData = await geminiRes.json();

  if (!geminiRes.ok) {
    return new Response(JSON.stringify({ error: 'Gemini API error', details: geminiData }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Extract the text response and parse JSON
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = rawText.replace(/```json|```/g, '').trim();

  let sensoryData;
  try {
    sensoryData = JSON.parse(clean);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to parse Gemini response', raw: rawText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  return new Response(JSON.stringify(sensoryData), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
