import crypto from 'crypto';

const GEMINI_PROMPT = `You are a children's content analyst for Glimpsy, a family content curation platform.

Watch this video and return a JSON sensory and visual assessment.
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

colour_intensity (0–10):
  0 = Greyscale or near-monochrome
  1 = Very muted, pastel, natural tones
  2 = Soft colours, mostly gentle palette
  3 = Normal children's content colour range
  4 = Vivid, saturated colours throughout
  5 = Extremely bright, neon, highly saturated

edit_pace (0–10):
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
  ALWAYS flag loud_sudden_sounds=true for ANY sudden audio shock — e.g. jump scares, crashes,
  bangs, or unexpected loud noises. Do NOT flag for upbeat theme tunes, cheerful music,
  or predictable fanfares even if they are energetic.

overall_score (0–5 where 5 = very calm, 0 = very stimulating):
  5 = Very calm, 4 = Mostly calm, 3 = Moderate, 2 = Quite stimulating,
  1 = Very stimulating, 0 = Extremely stimulating

orienting_reflex: true if looming objects, sudden brightness spikes, or objects appearing suddenly at frame edge

visual_justifications.note: if ANY score is 3 or above, one sentence explaining why. Empty string otherwise.

sensory_notes: one sentence describing the overall sensory experience.`;

async function getAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })).toString('base64url');

  const unsignedToken = `${header}.${payload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsignedToken);
  const signature = sign.sign(sa.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${unsignedToken}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Failed to get access token: ' + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { youtubeUrl, title, type } = req.body;

  if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });

  let accessToken;
  try {
    accessToken = await getAccessToken(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (e) {
    return res.status(500).json({ error: 'Auth failed', details: e.message });
  }

  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const projectId = sa.project_id;
  const prompt = GEMINI_PROMPT
    .replace('{{title}}', title || 'Unknown')
    .replace('{{type}}', type || 'tv');

  const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`;

  let geminiRes;
  try {
    geminiRes = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
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
          maxOutputTokens: 8192
        }
      })
    });
  } catch (e) {
    return res.status(502).json({ error: 'Fetch to Vertex AI failed', details: e.message });
  }

  const rawBody = await geminiRes.text();
  let geminiData;
  try {
    geminiData = JSON.parse(rawBody);
  } catch (e) {
    return res.status(502).json({ error: 'Gemini non-JSON response', raw: rawBody.slice(0, 500) });
  }

  if (!geminiRes.ok) {
    return res.status(502).json({ error: 'Gemini API error', details: geminiData });
  }

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = rawText.replace(/```json|```/g, '').trim();

  let sensoryData;
  try {
    sensoryData = JSON.parse(clean);
  } catch (e) {
    return res.status(502).json({ error: 'Failed to parse Gemini response', raw: rawText });
  }

  return res.status(200).json(sensoryData);
}
