// Password gate for the whole site (pages + API). Set DASH_PASSWORD in Vercel env vars.
// Browser shows the native login prompt. If DASH_USERNAME is set it must match too.
export const config = { matcher: '/((?!favicon.svg|logo.png|logo-mark.svg|site.webmanifest).*)' };

export default function middleware(request) {
  const password = process.env.DASH_PASSWORD;
  if (!password) return; // no password configured: open (not recommended)
  const header = request.headers.get('authorization') || '';
  // Vercel Cron authenticates with CRON_SECRET as a bearer token.
  if (process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}` && new URL(request.url).pathname === '/api/cron-audit') return;
  if (header.startsWith('Basic ')) {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(':');
    const user = process.env.DASH_USERNAME;
    const userOk = !user || decoded.slice(0, i).trim().toLowerCase() === user.toLowerCase();
    if (userOk && decoded.slice(i + 1) === password) return;
  }
  return new Response('Authentication required', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="Dayone Command Centre"' },
  });
}
