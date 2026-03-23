import { NextResponse } from 'next/server';

export function middleware(request) {
  const host = request.headers.get('host') || '';

  // Only protect admin.glimpsy.uk
  if (!host.includes('admin.glimpsy.uk')) {
    return NextResponse.next();
  }

  const basicAuth = request.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, password] = atob(authValue).split(':');

    if (user === 'admin' && password === process.env.ADMIN_PASSWORD) {
      return NextResponse.next();
    }
  }

  // Return 401 and prompt browser's native auth dialog
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Glimpsy Admin"'
    }
  });
}

export const config = {
  matcher: ['/', '/admin.html']
};
