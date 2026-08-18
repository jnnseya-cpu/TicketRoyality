import { notFound } from 'next/navigation';
import Link from 'next/link';

import { Badge } from '@/frontend/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { attributionsFor, getLink, statsKeyMatches } from '@/backend/services/partners';
import { toMajor } from '@/shared/fees';
import { formatCurrency } from '@/shared/utils';

export const dynamic = 'force-dynamic';

/**
 * A partner's own performance page.
 *
 * ## Why there is no login
 *
 * Almost no affiliate, influencer or promoter has an account here, and requiring one to
 * see their own numbers is how a referral programme quietly dies — the partner stops
 * checking, stops posting, and nobody ever finds out that a login was the reason.
 *
 * The URL carries a key derived from the code and a server secret. It proves the holder
 * was given this link by the organiser, which is exactly the authority a read-only page
 * needs. There is nothing to steal that the link itself does not already grant, and
 * nothing here can be changed.
 *
 * ## What it deliberately does not show
 *
 * No buyer names, no emails, no ticket references. A partner is owed their numbers, not
 * an audience list — the people who bought are the organiser's customers and ours, and a
 * commission does not come with a copy of them.
 */
export default async function PartnerStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { code } = await params;
  const { k } = await searchParams;

  if (!k || !statsKeyMatches(code, k)) notFound();

  const link = await getLink(code);
  if (!link) notFound();

  const rows = await attributionsFor(link.code, 100);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ticketroyality.com';
  const shareUrl = `${site}/r/${link.code}`;
  const allocationLeft =
    link.allocation === undefined ? null : Math.max(0, link.allocation - link.ticketsSold);

  return (
    <div className="container max-w-4xl py-12">
      <div className="mb-8">
        <Badge variant="secondary" className="mb-2 capitalize">
          {link.kind}
        </Badge>
        <h1 className="font-headline text-3xl font-bold">{link.partnerName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your link:{' '}
          <span className="font-mono text-foreground">{shareUrl}</span>
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Clicks sent', value: String(link.clicks) },
          { label: 'Orders', value: String(link.sales) },
          { label: 'Tickets', value: String(link.ticketsSold) },
          {
            label: 'Commission earned',
            value: formatCurrency(toMajor(link.commissionMinor)),
            sub: `${link.commissionPercent}% of ticket value`,
          },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/50">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-headline text-2xl font-bold">{stat.value}</p>
              {stat.sub && <p className="text-xs text-muted-foreground">{stat.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {allocationLeft !== null && (
        <Card className="mb-8 border-primary/30">
          <CardContent className="p-5 text-sm">
            {allocationLeft > 0 ? (
              <>
                <span className="font-semibold">{allocationLeft}</span> of your{' '}
                {link.allocation} allocation left to sell.
              </>
            ) : (
              <>
                Your allocation of {link.allocation} is fully sold. People can still buy through
                your link — those sales just do not earn.
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!link.active && (
        <Card className="mb-8 border-destructive/40">
          <CardContent className="p-5 text-sm">
            This link is paused, so new clicks are not being tracked. Anything already earned
            still stands.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your orders</CardTitle>
          <CardDescription>
            What each sale earned. Payment is arranged with the organiser directly —
            TicketRoyality records what is owed, it does not move the money.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No sales through your link yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead className="text-right">Ticket value</TableHead>
                  <TableHead className="text-right">Your commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(toMajor(row.faceMinor))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(toMajor(row.commissionMinor))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Keep this page&rsquo;s address private — it is how you get back in.{' '}
        <Link href="/events" className="text-primary hover:underline">
          Browse events
        </Link>
      </p>
    </div>
  );
}
