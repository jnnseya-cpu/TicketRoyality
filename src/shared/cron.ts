import 'server-only';

/**
 * Vercel Cron authenticates by sending a bearer token it was configured with.
 * Without this check the endpoints are public: anyone who guesses the path can
 * release every checkout hold on the platform, which during an on-sale is an
 * inventory attack rather than an inconvenience.
 */
export function isAuthorisedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
