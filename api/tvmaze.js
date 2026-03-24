export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { title, id } = req.query;
  if (!title && !id) return res.status(400).json({ error: 'title or id required' });

  try {
    let tvmazeId = id;

    // If no TVmaze ID provided, search by title first
    if (!tvmazeId) {
      const searchRes = await fetch(
        `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}`
      );
      if (!searchRes.ok) return res.status(404).json({ error: 'Show not found on TVmaze' });
      const showData = await searchRes.json();
      tvmazeId = showData.id;
    }

    // Fetch all episodes
    const epsRes = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}/episodes`);
    if (!epsRes.ok) return res.status(404).json({ error: 'Episodes not found' });
    const episodes = await epsRes.json();

    // Map to Glimpsy episode shape
    const mapped = episodes.map(ep => ({
      tvmaze_id: ep.id,
      season: ep.season,
      number: ep.number,
      title: ep.name || '',
      synopsis: ep.summary ? ep.summary.replace(/<[^>]+>/g, '') : '',
      airdate: ep.airdate || null,
      duration: ep.runtime || null
    }));

    return res.status(200).json({
      tvmaze_id: tvmazeId,
      episode_count: mapped.length,
      episodes: mapped
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
