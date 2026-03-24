export const config = {
  matcher: '/(.*)',
  runtime: 'edge'
};

export default async function middleware(request) {
  const host = request.headers.get('host') || '';

  // Only protect admin.glimpsy.uk
  if (!host.includes('admin.glimpsy.uk')) {
    return;
  }

  const basicAuth = request.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const decoded = atob(authValue);
    const [user, password] = decoded.split(':');

    if (user === 'admin' && password === process.env.ADMIN_PASSWORD) {
      return;
    }
  }

  // Prompt browser's native auth dialog
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Glimpsy Admin"'
    }
  });
}
