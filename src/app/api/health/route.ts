import { NextResponse } from 'next/server';

import { isFirebaseConfigured } from '@/shared/firebase/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness in one endpoint.
 *
 * Returns 200 while the process can serve traffic, and 503 only when a dependency the
 * *transactional core* needs is missing. Optional providers are reported but never fail
 * the check — an AI outage must not pull the ticket path out of the load balancer,
 * which is the same fail-open rule the connectors follow (docs/06 §6.23).
 */
interface DependencyStatus {
  name: string;
  configured: boolean;
  critical: boolean;
}

export async function GET() {
  const dependencies: DependencyStatus[] = [
    { name: 'datastore', configured: isFirebaseConfigured, critical: true },
    { name: 'stripe', configured: Boolean(process.env.STRIPE_SECRET_KEY), critical: false },
    { name: 'bitripay', configured: Boolean(process.env.BITRIPAY_CLIENT_ID), critical: false },
    {
      name: 'ai',
      configured: Boolean(process.env.GEMINI_API_KEY ?? process.env.ANTHROPIC_API_KEY),
      critical: false,
    },
    {
      name: 'maps',
      configured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
      critical: false,
    },
  ];

  const failing = dependencies.filter((d) => d.critical && !d.configured);
  const degraded = dependencies.filter((d) => !d.critical && !d.configured);

  return NextResponse.json(
    {
      status: failing.length > 0 ? 'unhealthy' : degraded.length > 0 ? 'degraded' : 'healthy',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      uptimeSeconds: Math.round(process.uptime()),
      dependencies,
    },
    {
      status: failing.length > 0 ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
