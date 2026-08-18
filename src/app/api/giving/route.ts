import { NextResponse } from 'next/server';

import { requireUser } from '@/backend/auth/require-user';
import {
  claimFor,
  currentDeclaration,
  donationsFor,
  recordDeclaration,
  withdrawDeclaration,
} from '@/backend/services/donations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Giving: declarations by the donor, the claim by the charity.
 *
 * The Gift Aid declaration is made by the person giving, about their own tax position, so
 * it is written under their verified token and never on their behalf. The claim is read
 * by the organiser and covers only their own donations — one charity cannot see another's
 * donor list, which is the whole reason this is not a client-side query.
 */
export async function GET(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const query = new URL(request.url).searchParams;
  const view = query.get('view') ?? 'claim';

  // A donor asking whether they already have a declaration with this charity.
  if (view === 'declaration') {
    const organiserId = query.get('organiserId') ?? '';
    const declaration = await currentDeclaration(organiserId, caller.email ?? '');
    return NextResponse.json({
      declared: declaration !== null,
      // The address is echoed so the form can be prefilled; nothing else about the
      // donor's other charities or gifts is returned.
      declaration: declaration
        ? {
            firstName: declaration.firstName,
            lastName: declaration.lastName,
            addressLine: declaration.addressLine,
            postcode: declaration.postcode,
            madeAt: declaration.madeAt,
            enduring: declaration.enduring,
          }
        : null,
    });
  }

  const from = query.get('from') ?? undefined;
  const to = query.get('to') ?? undefined;

  if (view === 'donations') {
    return NextResponse.json({ donations: await donationsFor(caller.uid, { from, to }) });
  }

  const claim = await claimFor(caller.uid, { from, to });

  // The CSV is returned as a file when asked for as one, so the schedule can go straight
  // to the accountant without a copy-and-paste through a spreadsheet.
  if (query.get('format') === 'csv') {
    return new NextResponse(claim.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="gift-aid-claim.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({ summary: claim.summary });
}

export async function POST(request: Request) {
  const caller = await requireUser(request);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  let body: {
    action?: string;
    organiserId?: string;
    firstName?: string;
    lastName?: string;
    addressLine?: string;
    postcode?: string;
    enduring?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const organiserId = String(body.organiserId ?? '');
  if (!organiserId) return NextResponse.json({ error: 'Which charity?' }, { status: 400 });

  if (body.action === 'withdraw') {
    const done = await withdrawDeclaration(organiserId, caller.email ?? '');
    return done
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Could not withdraw that declaration.' }, { status: 503 });
  }

  const result = await recordDeclaration({
    organizerId: organiserId,
    // Always the verified token's email. A declaration is a statement about the person
    // making it, and one made under somebody else's address is worse than none.
    email: caller.email ?? '',
    userId: caller.uid,
    firstName: String(body.firstName ?? ''),
    lastName: String(body.lastName ?? ''),
    addressLine: String(body.addressLine ?? ''),
    postcode: String(body.postcode ?? ''),
    enduring: body.enduring !== false,
  });

  if (result.ok) return NextResponse.json({ ok: true, id: result.id });

  return NextResponse.json(
    {
      error:
        result.problems.length > 0
          ? 'Check the details on the form.'
          : 'Gift Aid declarations are unavailable right now.',
      problems: result.problems,
    },
    { status: result.problems.length > 0 ? 400 : 503 }
  );
}
