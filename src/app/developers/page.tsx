import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Braces, KeyRound, TerminalSquare, Webhook } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'A read API over your events and tickets, signed webhooks, and a sandbox key that touches nothing real.',
};

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/events',
    auth: 'events:read',
    note: 'Your own events, with tier prices and how many are sold.',
  },
  {
    method: 'GET',
    path: '/tickets',
    auth: 'tickets:read',
    note: 'Filter with ?event_id= and ?limit=. Names and emails need attendees:read too.',
  },
];

const WEBHOOKS = [
  { type: 'order.completed', payload: 'event_id, tier_id, quantity, amount_minor, currency' },
  { type: 'ticket.redeemed', payload: 'reference, event_id, tier_name, seat' },
  { type: 'ticket.refunded', payload: 'reference, event_id' },
  { type: 'donation.received', payload: 'amount_minor, currency, event_id' },
];

const PRINCIPLES = [
  {
    icon: KeyRound,
    title: 'Sandbox first',
    body: 'A tr_test_ key reads fixture data and touches nothing real — including a sold-out tier, a refunded ticket and a redeemed one, which a fresh live account has none of. Live and test are different keys rather than a header, so a request cannot reach real data by leaving something out.',
  },
  {
    icon: Webhook,
    title: 'Signed webhooks',
    body: 'HMAC-SHA256 over timestamp.body with your endpoint’s own secret, in a TicketRoyality-Signature header. Reject anything older than five minutes, or a captured payload can be replayed forever. Failures retry with an increasing delay and stay in your delivery log either way.',
  },
  {
    icon: Braces,
    title: 'Scoped keys',
    body: 'A key carries only the scopes you give it. Attendee names and emails sit behind attendees:read, so a reporting key can count tickets without ever being able to export a mailing list.',
  },
  {
    icon: TerminalSquare,
    title: 'Read-only, and honest about it',
    body: 'Everything is under /api/v1 and every endpoint is a GET. There is no write API yet — no creating events, no placing orders, no scanning through the API — and no SDKs. When those exist they will be on this page and not before.',
  },
];

export default function DevelopersPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Developers
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">Build on the OS</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Read your events and tickets from your own systems, and get told when something
          happens. A sandbox key in a minute, webhooks that are signed and replay-safe.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/register/organiser">
              Get sandbox keys <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="mailto:info@ticketroyality.com?subject=API%20access">Talk to us</a>
          </Button>
        </div>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map((principle) => (
          <Card key={principle.title}>
            <CardContent className="space-y-3 pt-6">
              <principle.icon className="h-7 w-7 text-primary" />
              <h2 className="font-headline text-lg font-semibold">{principle.title}</h2>
              <p className="text-sm text-muted-foreground">{principle.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-14">
        <h2 className="font-headline text-2xl font-bold">Core endpoints</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          All paths are prefixed with <code className="text-primary">/api/v1</code>.
          Your API key in the <code className="text-primary">Authorization: Bearer</code> header.
          Create one under Developers in your organiser dashboard.
        </p>
        <Card className="mt-4">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Method</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead className="w-32">Auth</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ENDPOINTS.map((endpoint) => (
                  <TableRow key={endpoint.method + endpoint.path}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {endpoint.method}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{endpoint.path}</TableCell>
                    <TableCell className="text-xs">{endpoint.auth}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {endpoint.note}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-14">
        <h2 className="font-headline text-2xl font-bold">Webhook events</h2>
        <Card className="mt-4">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-64">Event type</TableHead>
                  <TableHead>Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {WEBHOOKS.map((hook) => (
                  <TableRow key={hook.type}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {hook.type}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {hook.payload}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="mt-3 text-sm text-muted-foreground">
          The webhook is a notification, not the source of truth. If you miss one,
          re-read the resource — never treat a missing webhook as a missing event.
        </p>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-headline text-xl font-semibold">Verifying a signature</h2>
            <p className="text-sm text-muted-foreground">
              Split the header on commas into <code>t</code> and <code>v1</code>. Compute
              HMAC-SHA256 of <code>{'`${t}.${rawBody}`'}</code> with your endpoint secret and
              compare it to <code>v1</code> in constant time. Reject anything where{' '}
              <code>t</code> is more than five minutes old.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-6">
            {/* Said plainly rather than promised. A developer who plans around a rate
                limit that does not exist finds out under load. */}
            <h2 className="font-headline text-xl font-semibold">Not built yet</h2>
            <p className="text-sm text-muted-foreground">
              No write endpoints, no SDKs, no OpenAPI file, no published rate limits and no
              cursor pagination — <code>/tickets</code> takes a <code>limit</code> and tops
              out at 500. Ask for what you need and it goes on the list.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
