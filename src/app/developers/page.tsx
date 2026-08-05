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
    'REST API, signed webhooks, sandbox keys and SDKs. Build ticketing, entry and payment verification on TicketRoyality.',
};

const ENDPOINTS = [
  { method: 'POST', path: '/events', auth: 'Organiser', note: 'Creates a draft. Never publishes.' },
  { method: 'GET', path: '/events', auth: 'Public', note: 'Cursor-paginated listing.' },
  { method: 'GET', path: '/events/:id', auth: 'Public', note: 'Tiers, venue, organiser.' },
  { method: 'POST', path: '/events/:id/publish', auth: 'Organiser', note: 'Runs the pre-publish checklist.' },
  { method: 'POST', path: '/events/:id/cancel', auth: 'Organiser', note: 'Requires confirmed totals.' },
  { method: 'POST', path: '/orders', auth: 'Customer', note: 'Idempotency-Key required.' },
  { method: 'POST', path: '/orders/:id/pay', auth: 'Customer', note: 'Idempotency-Key required.' },
  { method: 'POST', path: '/orders/:id/refund', auth: 'Organiser', note: 'Line-scoped, policy-checked.' },
  { method: 'POST', path: '/tickets/:id/transfer', auth: 'Customer', note: 'Refused if non-transferable.' },
  { method: 'POST', path: '/scans', auth: 'Gate staff', note: 'Verifies the signed QR server-side.' },
];

const WEBHOOKS = [
  { type: 'order.completed', payload: 'order_id, event_id, user_id, amount, currency, ticket_ids[]' },
  { type: 'ticket.scanned', payload: 'ticket_id, gate_id, status, timestamp, event_id' },
  { type: 'payout.completed', payload: 'payout_id, org_id, amount, currency, provider_ref' },
  { type: 'refund.processed', payload: 'refund_id, order_id, amount, reason' },
  { type: 'fraud.alert', payload: 'transaction_id, fraud_score, rule_triggered, recommended_action' },
  { type: 'kyb.approved / kyb.rejected', payload: 'org_id, kyb_status, review_notes' },
  { type: 'verification.matched', payload: 'expectation_id, amount, payer_msisdn, provider_reference' },
];

const PRINCIPLES = [
  {
    icon: KeyRound,
    title: 'Sandbox first',
    body: 'Sandbox keys are issued immediately, before verification finishes. The sandbox reproduces every failure mode, not just the happy path — including partial and ambiguous payment verification.',
  },
  {
    icon: Webhook,
    title: 'Signed webhooks',
    body: 'HMAC-SHA256 over timestamp.body with your secret. Reject anything older than five minutes or a captured payload can be replayed forever. Retries back off for 24 hours.',
  },
  {
    icon: Braces,
    title: 'Idempotent by default',
    body: 'Every mutating request accepts an Idempotency-Key. Replaying one returns the original response and never creates a second resource. Required on orders, payments and scans.',
  },
  {
    icon: TerminalSquare,
    title: 'Versioned, with a window',
    body: 'Everything is under /api/v1. Breaking changes get /v2 and both stay live through a published deprecation window. We do not change a response shape underneath you.',
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
          A REST API over events, orders, tickets, entry and payment verification.
          Sandbox keys in a minute, SDKs in four languages, webhooks that are signed and
          replay-safe.
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
          Bearer JWT in the <code className="text-primary">Authorization</code> header.
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
            <h2 className="font-headline text-xl font-semibold">SDKs</h2>
            <p className="text-sm text-muted-foreground">
              Node.js, Python, PHP and React Native, with code samples for every flow.
              OpenAPI 3.0 specification with a Postman collection export.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-headline text-xl font-semibold">Rate limits</h2>
            <p className="text-sm text-muted-foreground">
              Per key and per principal, enforced at the gateway. Limits and remaining
              quota are returned on every response, so you never have to guess where you
              are.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
