export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }

  // Set a signed session cookie valid for 8 hours
  res.setHeader('Set-Cookie', [
    `glimpsy_admin=1; HttpOnly; Secure; SameSite=Strict; Max-Age=28800; Path=/`
  ]);

  return res.status(200).json({ ok: true });
}
