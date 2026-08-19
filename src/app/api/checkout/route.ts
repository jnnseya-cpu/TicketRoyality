import { NextResponse } from 'next/server';

import { createCheckoutSession, isStripeConfigured, type CheckoutLine } from '@/backend/payments/stripe';
import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { recordPaymentEvent } from '@/backend/services/payment-events';
import { computeOrderFees, toMajor, toMinor } from '@/shared/fees';
import { placeHold, releaseHold } from '@/backend/services/holds';
import type { Coupon, TicketTier } from '@/shared/types';
import {
  applyCoupon,
  resolveLinePrice,
  resolveMix,
  tierSaleWindow,
  upgradeTierFor,
  type MixEntry,
} from '@/shared/pricing';
import { codeOpensTier } from '@/backend/services/access-codes';
import { encodeCart } from '@/shared/cart-metadata';
import { REF_COOKIE } from '@/backend/services/partners';
import { getPass, passAvailability } from '@/backend/services/season-passes';
import { meetsTier, membershipFor } from '@/backend/services/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe checkout entry point.
 *
 * Responds with a 303 redirect rather than JSON, and the client posts to it with a
 * plain HTML <form>. That keeps the navigation inside the user's original click
 * gesture — an async fetch-then-redirect gets blocked by the browser with "the current
 * window does not have permission to navigate the target frame".
 *
 * This handler parses, **prices**, and routes; all Stripe knowledge lives in
 * `@/backend/payments/stripe`.
 *
 * ## The buyer pays the all-in total, computed here
 *
 * The service fee is added server-side, from `shared/fees.ts`, and appears as one
 * "TicketRoyality Service Fee" line on the Stripe session. It is never taken from the
 * form: a fee the browser could post is a fee the browser could set to zero.
 *
 * ## Face value is re-read from Firestore where possible
 *
 * The single-event path posts `eventId` and `tierId`, so the tier's real price is looked
 * up and the posted `amount` is ignored. That closes a hole that predates this change —
 * the form previously named its own price, and a hand-crafted POST could have bought a
 * £250 ticket for a penny. The cart path re-prices every line the same way, and carries
 * the priced basket to the webhook in metadata (`shared/cart-metadata.ts`) so a paid
 * basket issues every line — it used to carry nothing, so a paid basket issued nothing.
 */
export async function POST(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${siteUrl}/checkout/cancel?reason=${encodeURIComponent(reason)}`, {
      status: 303,
    });


  /*
   * The partner who sent this buyer, from the first-party cookie the tracked link set.
   * Read here and carried to the webhook; the commission percentage is never taken from
   * it — that is read from the stored link when the payment lands.
   */
  const referral = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REF_COOKIE}=`))
    ?.slice(REF_COOKIE.length + 1);

  const form = await request.formData();
  const lines: CheckoutLine[] = [];
  /* Carried through the whole checkout so both the single-event and cart paths can prove
     a hidden tier was legitimately unlocked. One code per checkout: a basket mixing two
     different partners' hidden rates is not a real purchase. */
  const accessCode = String(form.get('accessCode') ?? '');
  /* Chosen seats, single-event path only. A cart spans several events and would need a
     multi-event transaction to hold them, which is recorded in STATUS.md rather than
     half-built. */
  const chosenSeats = String(form.get('seats') ?? '')
    .split(',')
    .map((seat) => seat.trim().toUpperCase())
    .filter(Boolean);

  /*
   * Every line that maps to a real tier, kept so a wholly free order can be issued
   * without a card. Payment lines and claim lines are the same thing priced
   * differently; this list is what lets the zero-price case skip the card instead of
   * dying inside Stripe, which refuses zero-amount sessions.
   */
  const claimables: Array<{ eventId: string; tierId: string; quantity: number; currency: string }> = [];
  /** Attendee-type entries for a mixed single-event order; empty means single-price. */
  let mixEntries: MixEntry[] = [];
  /*
   * Cart lines with the CheckoutLine they priced into, kept as references so the coupon
   * spread below is already inside `line.amount` when the basket is encoded. This is what
   * reaches the webhook: without it a paid basket had no items in its metadata and
   * issued nothing.
   */
  const cartRefs: Array<{ eventId: string; tierId: string; quantity: number; line: CheckoutLine }> = [];
  /** The encoded basket for Stripe metadata; empty on every non-cart path. */
  let cartMetaValue = '';

  // `items` is a JSON array for cart checkout; single-event checkout sends flat fields.
  const rawItems = form.get('items');
  if (typeof rawItems === 'string') {
    let parsed: Array<{
      eventId?: string;
      tierId?: string;
      eventTitle: string;
      tierName: string;
      price: number;
      quantity: number;
      currency: string;
    }>;
    try {
      parsed = JSON.parse(rawItems);
    } catch {
      return NextResponse.json({ error: 'Malformed items payload.' }, { status: 400 });
    }

    /*
     * Every cart line is re-priced from Firestore.
     *
     * The posted `price` used to be taken at face value, so a hand-crafted POST could
     * buy a £250 ticket for a penny. The single-event path was fixed first; this closes
     * the same hole on the cart, which is the one a real basket goes through.
     *
     * A line whose event or tier no longer exists is refused rather than charged at the
     * price the browser remembered — a tier deleted between adding to cart and paying is
     * exactly when a stale price is most likely to be wrong.
     */
    for (const item of parsed) {
      const quantity = Math.max(1, Math.min(20, Number(item.quantity) || 1));
      let amount = Number(item.price) || 0;
      let currency = String(item.currency ?? 'GBP');
      let name = `${item.eventTitle} — ${item.tierName}`;

      if (isAdminConfigured() && item.eventId && item.tierId) {
        try {
          const doc = await getAdminDb().collection('events').doc(item.eventId).get();
          const data = doc.data() as
            | { title?: string; currency?: string; status?: string; ticketTiers?: TicketTier[] }
            | undefined;
          // The cart is the one path that does not reserve through placeHold, so the
          // cancelled-event refusal has to live here as well as there.
          if (data?.status === 'cancelled') {
            return fail(`${item.eventTitle} has been cancelled`);
          }
          const tier = data?.ticketTiers?.find((t) => t.id === item.tierId);
          if (!tier) return fail(`${item.eventTitle} is no longer on sale`);
          // A hidden tier is bought only by someone holding the code. Checked here and
          // not in the browser, because hiding a tier in the UI is not a control.
          if (
            tier.visibility === 'hidden' &&
            !(await codeOpensTier(item.eventId, item.tierId, accessCode))
          ) {
            return fail(`${tier.name} needs an access code`);
          }
          // A presale that has not opened, or an early-bird that has closed. Enforced
          // here because a greyed-out button is on sale to anyone who can post a form.
          const window = tierSaleWindow(tier);
          if (!window.onSale) {
            return fail(
              window.reason === 'not-yet'
                ? `${tier.name} is not on sale yet`
                : `${tier.name} has closed`
            );
          }
          /*
           * Stock, checked before the card. The cart takes no hold (it spans events), so
           * without this a basket could be charged for tickets the tier does not have and
           * refused only at issuance — after the money moved. The cart's stepper has no
           * idea what remains; this is where the platform does.
           */
          const remaining = tier.quantity - (tier.sold ?? 0);
          if (quantity > remaining) {
            return fail(
              remaining > 0
                ? `Only ${remaining} left of ${tier.name} for ${data?.title ?? item.eventTitle}`
                : `${tier.name} for ${data?.title ?? item.eventTitle} is sold out`
            );
          }
          // A fixed tier ignores the posted price; a pay-what-you-want tier accepts it
          // above the organiser's floor. The mode comes from the stored event, so a
          // crafted POST cannot turn a £250 ticket into a donation.
          amount = resolveLinePrice(tier, Number(item.price));
          currency = data?.currency ?? currency;
          name = `${data?.title ?? item.eventTitle} — ${tier.name}`;
        } catch {
          return fail('Could not confirm the ticket prices');
        }
      }

      const line: CheckoutLine = { name, amount, quantity, currency };
      lines.push(line);
      if (item.eventId && item.tierId) {
        claimables.push({ eventId: item.eventId, tierId: item.tierId, quantity, currency });
        cartRefs.push({ eventId: item.eventId, tierId: item.tierId, quantity, line });
      }
    }

    /*
     * The coupon, validated here rather than trusted.
     *
     * The cart posts a code; the server reads the coupon, checks it has not expired or
     * been exhausted, and spreads the discount across the re-priced lines. The browser
     * previously did all of that and posted the result, which made every discount a
     * suggestion the server accepted.
     */
    const couponCode = String(form.get('couponCode') ?? '').trim().toUpperCase();
    if (couponCode && isAdminConfigured()) {
      try {
        const found = await getAdminDb()
          .collection('coupons')
          .where('code', '==', couponCode)
          .limit(1)
          .get();

        const coupon = found.empty ? null : ({ id: found.docs[0].id, ...found.docs[0].data() } as Coupon);
        const subtotal = lines.reduce((t, l) => t + l.amount * l.quantity, 0);
        const check = applyCoupon(subtotal, coupon);

        if (check.valid && check.discount > 0 && subtotal > 0) {
          const factor = check.total / subtotal;
          for (const line of lines) line.amount = Math.round(line.amount * factor * 100) / 100;
        }
      } catch {
        // A coupon that cannot be read is simply not applied. Failing the whole checkout
        // over a discount would turn a promotion outage into a sales outage.
      }
    }

    /*
     * The basket, encoded for the webhook AFTER the coupon spread so each unit price is
     * what was actually charged. Refused, never truncated, when it cannot fit Stripe's
     * metadata limit: a silently dropped line is a paid-for ticket that never exists —
     * the exact failure this encoding removes.
     */
    if (cartRefs.length > 0) {
      const encoded = encodeCart(
        cartRefs.map((ref) => ({
          eventId: ref.eventId,
          tierId: ref.tierId,
          quantity: ref.quantity,
          unitMajor: ref.line.amount,
        }))
      );
      if (!encoded.ok) {
        return fail('That basket is too large for one payment — please split it into two orders');
      }
      cartMetaValue = encoded.value;
    }
  } else if (form.get('passId')) {
    /*
     * A season pass. One line, one charge, and a ticket in every covered fixture once it
     * settles — see `season-passes.ts`.
     *
     * Availability is checked across every fixture **before** the card, because a pass
     * that can only seat somebody at nine of ten nights is a refund and an apology, and
     * finding that out afterwards is the expensive way.
     */
    const passId = String(form.get('passId'));
    const pass = await getPass(passId);
    if (!pass) return fail('That season pass no longer exists');

    const availability = await passAvailability(passId);
    if (!availability.ok) return fail(availability.error);

    lines.push({
      name: `${pass.name} — season pass`,
      amount: pass.price,
      quantity: 1,
      currency: pass.currency,
    });
  } else {
    const eventId = String(form.get('eventId') ?? '');
    const tierId = String(form.get('tierId') ?? '');
    const quantity = Math.max(1, Math.min(10, Number(form.get('quantity') ?? 1)));

    // The authoritative price. Only falls back to the posted amount when the Admin SDK
    // is unavailable, which is a deployment fault rather than a normal path.
    let amount = Number(form.get('amount') ?? 0);
    let name = String(form.get('name') ?? 'Event ticket');
    let currency = String(form.get('currency') ?? 'GBP');

    if (isAdminConfigured() && eventId && tierId) {
      try {
        const doc = await getAdminDb().collection('events').doc(eventId).get();
        const data = doc.data() as
          | { title?: string; currency?: string; organizerId?: string; ticketTiers?: TicketTier[] }
          | undefined;
        const tier = data?.ticketTiers?.find((t) => t.id === tierId);
        if (!tier) return fail('That ticket type is no longer on sale');
        if (tier.visibility === 'hidden' && !(await codeOpensTier(eventId, tierId, accessCode))) {
          return fail('That ticket type needs an access code');
        }
        const window = tierSaleWindow(tier);
        if (!window.onSale) {
          return fail(
            window.reason === 'not-yet'
              ? 'That ticket type is not on sale yet'
              : 'That ticket type has closed'
          );
        }

        /*
         * A members' presale, enforced against attendance the buyer actually has.
         *
         * A presale that is only a secret link leaks in one screenshot; this is the
         * server deciding, so the early window belongs to the people who earned it.
         */
        if (tier.minLoyaltyTier && tier.minLoyaltyTier !== 'none') {
          const buyerId = String(form.get('userId') ?? '');
          const organizerId = data?.organizerId as string | undefined;
          const membership = buyerId && organizerId
            ? await membershipFor(organizerId, buyerId)
            : null;

          if (!membership || !meetsTier(membership.tier, tier.minLoyaltyTier)) {
            return fail(`${tier.name} is open to returning customers first`);
          }
        }
        amount = resolveLinePrice(tier, amount);
        name = `${data?.title ?? 'Event'} — ${tier.name}`;
        currency = data?.currency ?? currency;

        /*
         * A mixed-price order — Adult ×2 + Child ×1 against one tier (docs/23 §26).
         * The browser posts only type ids and counts; every price comes from the
         * stored tier, the same no-trust rule as the single-price path. The mix
         * REPLACES the plain quantity: its total is what the hold reserves and what
         * issuance mints, so the priced half and the issued half cannot disagree.
         */
        const rawMix = String(form.get('mix') ?? '');
        if (rawMix) {
          let requestedMix: Array<{ typeId?: unknown; quantity?: unknown }>;
          try {
            requestedMix = JSON.parse(rawMix);
          } catch {
            return fail('Malformed ticket selection');
          }

          const resolved = resolveMix(tier, requestedMix);
          if (!resolved.ok) return fail(resolved.error);

          /*
           * Contradiction guard: a fixed tier priced above zero whose chosen types are
           * ALL free would issue a paid event's tickets for nothing — which happened,
           * live, when attendee-type rows defaulted to £0.00. The editor now refuses to
           * save that state; this refuses to sell it on events saved before the fix.
           * A mix with any paid entry passes untouched (free Under-5s beside a paid
           * Adult is deliberate pricing, not an accident).
           */
          if (
            tier.pricing !== 'choose' &&
            tier.price > 0 &&
            resolved.entries.every((entry) => entry.price === 0)
          ) {
            return fail(
              'The prices on this ticket type are misconfigured — please contact the organiser'
            );
          }

          mixEntries = resolved.entries;
          for (const entry of resolved.entries) {
            lines.push({
              name: `${data?.title ?? 'Event'} — ${tier.name} (${entry.typeName})`,
              amount: entry.price,
              quantity: entry.quantity,
              currency,
            });
          }
          claimables.push({ eventId, tierId, quantity: resolved.total, currency });
        }
      } catch {
        return fail('Could not confirm the ticket price');
      }
    }

    if (mixEntries.length === 0) {
      lines.push({ name, amount, quantity, currency });
      if (eventId && tierId) claimables.push({ eventId, tierId, quantity, currency });
    }
  }

  /*
   * A gift, read before the emptiness check because a donation on its own is a complete
   * checkout: somebody giving £20 to a charity is not buying anything, and refusing them
   * for having an empty basket would be the wrong answer to the right question.
   */
  const donationMinor = Math.max(0, Math.round(Number(form.get('donationMinor') ?? 0)));

  const registryEarly = Math.max(0, Math.round(Number(form.get('registryMinor') ?? 0)));

  if (lines.length === 0 && donationMinor === 0 && registryEarly === 0) {
    return NextResponse.json({ error: 'Nothing to check out.' }, { status: 400 });
  }

  const currency = lines[0]?.currency ?? 'GBP';

  /*
   * The service fee, as its own Stripe line so the buyer's receipt itemises what the
   * event page already showed them. One line for the whole order — the engine computes
   * it per paid ticket and sums, which is why this is a single quantity-1 line rather
   * than a per-ticket charge Stripe would round differently.
   */
  const quote = computeOrderFees(
    lines.map((line) => ({ faceMinor: toMinor(line.amount), qty: line.quantity }))
  );

  if (quote.serviceFeeMinor > 0) {
    lines.push({
      name: 'TicketRoyality Service Fee',
      amount: toMajor(quote.serviceFeeMinor),
      quantity: 1,
      currency,
    });
  }

  /*
   * A gift, added after the quote so it is **not** part of the fee base.
   *
   * Charging a percentage of a donation would be indefensible for a charity, and it is
   * the kind of line that gets quoted back in public. So the donation carries no platform
   * fee at all: the card cost on it is ours. The order matters — computing fees over a
   * list that already contained the donation would silently charge for it.
   *
   * It is also a separate amount for a legal reason, not a presentational one: Gift Aid
   * is claimed on a gift and never on a payment for admission.
   */
  if (donationMinor > 0) {
    lines.push({
      name: 'Donation',
      amount: toMajor(donationMinor),
      quantity: 1,
      currency,
    });
  }

  /*
   * A gift registry contribution. Also after the quote, and for the same reason: taking a
   * percentage of a wedding present is not a line this platform wants to defend. It is a
   * separate field from the donation because it is a different thing — a present for a
   * person carries no Gift Aid, and mixing the two would put registry money into a
   * charity's claim.
   */
  const registryMinor = Math.max(0, Math.round(Number(form.get('registryMinor') ?? 0)));
  const registryItemId = String(form.get('registryItemId') ?? '');

  if (registryMinor > 0 && registryItemId) {
    lines.push({
      name: String(form.get('registryTitle') ?? 'Gift'),
      amount: toMajor(registryMinor),
      quantity: 1,
      currency,
    });
  }

  /*
   * Reserve the inventory before sending anyone to a payment page.
   *
   * Without this the second buyer for the last seat pays in full and is refunded by
   * hand. Only the single-event path holds: a cart spans several events and tiers, and
   * holding across all of them needs a multi-event transaction that is a larger change
   * than this one — recorded in STATUS.md rather than half-done.
   */
  let holdId = '';
  /** Set when a sold-out tier was upgraded; issuance must consume the new tier. */
  let upgradedToTierId = '';
  const holdEventId = String(form.get('eventId') ?? '');
  const holdTierId = String(form.get('tierId') ?? '');

  if (typeof rawItems !== 'string' && holdEventId && holdTierId) {
    // A mixed order's total spans several lines; a single-price order is its one line.
    const quantity =
      mixEntries.length > 0
        ? mixEntries.reduce((sum, entry) => sum + entry.quantity, 0)
        : (lines[0]?.quantity ?? 1);

    // A seat per ticket or none at all. Two seats for three tickets would issue a third
    // ticket with no seat and nobody would notice until the door.
    if (chosenSeats.length > 0 && chosenSeats.length !== quantity) {
      return fail('Choose one seat for each ticket');
    }

    const hold = await placeHold(holdEventId, holdTierId, quantity, undefined, chosenSeats);
    if (!hold.ok) {
      /*
       * The sellout upgrade (stadiums card, opt-in per event).
       *
       * Only a clean sold-out on an unseated purchase qualifies: chosen seats belong to
       * a section wired to the sold-out tier, and moving them would seat people in a
       * room their section is not. The buyer pays the price they chose; the organiser
       * opted into giving away the difference rather than refusing the sale. Hidden
       * tiers, cheaper tiers, closed windows and part-fitting tiers are all excluded by
       * `upgradeTierFor`, whose test table is the specification.
       */
      if (hold.reason === 'sold-out' && chosenSeats.length === 0 && isAdminConfigured()) {
        try {
          const eventSnap = await getAdminDb().collection('events').doc(holdEventId).get();
          const eventData = eventSnap.data() as
            | { autoUpgradeOnSellout?: boolean; ticketTiers?: TicketTier[] }
            | undefined;

          const upgradeTo = eventData?.autoUpgradeOnSellout
            ? upgradeTierFor(eventData.ticketTiers ?? [], holdTierId, quantity)
            : null;

          if (upgradeTo) {
            const retry = await placeHold(holdEventId, upgradeTo.id, quantity, undefined, []);
            if (retry.ok) {
              holdId = retry.holdId;
              upgradedToTierId = upgradeTo.id;
              // The receipt says what happened; the amount says what was promised.
              for (const line of lines) {
                if (!line.name.includes('Service Fee') && line.name !== 'Donation') {
                  line.name = `${line.name} — upgraded to ${upgradeTo.name}`;
                }
              }
              if (claimables[0]) claimables[0].tierId = upgradeTo.id;
            }
          }
        } catch {
          // The upgrade is best-effort on top of a failure; the honest sold-out stands.
        }
      }

      if (!holdId) return fail(hold.error);
    } else {
      holdId = hold.holdId;
    }
  }

  /*
   * A wholly free order never sees a card.
   *
   * Free tiers only offered "Add to cart", and the cart's one exit was Stripe — which
   * refuses a zero-amount session. So a free event's tickets could be assembled into a
   * basket and then could not be obtained at all: the platform's free tier was a door
   * painted on a wall. The claim below writes the same `payment_events` document a paid
   * webhook writes (provider 'free', price 0), so ONE issuance path serves both and the
   * oversell guard, seat locks and hold release all apply to a free claim exactly as
   * they do to a paid one.
   */
  if (
    quote.buyerTotalMinor === 0 &&
    donationMinor === 0 &&
    registryMinor === 0 &&
    claimables.length > 0
  ) {
    const claimUserId = String(form.get('userId') ?? '');
    if (!claimUserId) {
      if (holdId) await releaseHold(holdId, 'abandoned');
      return fail('Sign in to claim free tickets');
    }
    if (!isAdminConfigured()) {
      if (holdId) await releaseHold(holdId, 'abandoned');
      return fail('Ticket issue is not configured');
    }

    try {
      const buyer = await getAdminDb().collection('users').doc(claimUserId).get();
      const buyerData = buyer.data() as { fullName?: string; email?: string } | undefined;
      if (!buyerData?.email) {
        if (holdId) await releaseHold(holdId, 'abandoned');
        return fail('Sign in to claim free tickets');
      }

      for (const [index, claim] of claimables.entries()) {
        await recordPaymentEvent({
          // Random, deliberately: a deterministic id would refuse the same person a
          // second pair of free tickets forever. Duplicate protection against a
          // double-submit is the hold (single path) and the cart clearing on redirect.
          providerEventId: `free_${crypto.randomUUID()}`,
          provider: 'free',
          providerType: 'free.claim',
          intent: 'issue',
          eventId: claim.eventId,
          tierId: claim.tierId,
          userId: claimUserId,
          quantity: claim.quantity,
          price: 0,
          currency: claim.currency,
          attendeeName: buyerData.fullName ?? 'Guest',
          attendeeEmail: buyerData.email,
          // Seats and the hold belong to the single-event path's first line only.
          seats: index === 0 && chosenSeats.length > 0 ? chosenSeats : undefined,
          holdId: index === 0 && holdId ? holdId : undefined,
          ...(index === 0 && mixEntries.length > 0 ? { mix: mixEntries } : {}),
        });
      }

      return NextResponse.redirect(`${siteUrl}/checkout/success?provider=free`, { status: 303 });
    } catch (error) {
      if (holdId) await releaseHold(holdId, 'abandoned');
      return fail(error instanceof Error ? error.message : 'Could not claim the tickets');
    }
  }

  /*
   * Tickets need an account to live in, checked BEFORE the card rather than after.
   *
   * A signed-out buyer could previously reach Stripe, pay, and hit the webhook's
   * missing-metadata stop — charged, with nothing issued and nowhere to issue it to.
   * A donation or registry gift on its own stays open to guests: it issues nothing.
   */
  if (!String(form.get('userId') ?? '') && (claimables.length > 0 || form.get('passId'))) {
    if (holdId) await releaseHold(holdId, 'abandoned');
    return fail('Sign in to buy tickets — they need an account to live in');
  }

  if (!isStripeConfigured()) {
    if (holdId) await releaseHold(holdId, 'abandoned');
    return fail('Stripe is not configured');
  }

  try {
    const url = await createCheckoutSession({
      lines,
      successUrl: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/checkout/cancel`,
      // Carried through to the webhook, which is what actually issues the tickets.
      metadata: {
        userId: String(form.get('userId') ?? ''),
        eventId: String(form.get('eventId') ?? ''),
        tierId: upgradedToTierId || String(form.get('tierId') ?? ''),
        quantity:
          mixEntries.length > 0
            ? String(mixEntries.reduce((sum, entry) => sum + entry.quantity, 0))
            : String(form.get('quantity') ?? '1'),
        // The resolved mix — server prices, not the browser's. Issuance flattens it
        // onto tickets in this order, which is also the seats' order.
        ...(mixEntries.length > 0 ? { mix: JSON.stringify(mixEntries) } : {}),
        // §16: the order keeps the pricing it was quoted under, forever. A historical
        // order must never be recomputed from whatever the config says later.
        pricingVersion: String(quote.pricingVersion),
        feeConfigVersion: quote.configVersion,
        faceMinor: String(quote.faceMinor),
        serviceFeeMinor: String(quote.serviceFeeMinor),
        buyerTotalMinor: String(quote.buyerTotalMinor),
        organiserPayoutMinor: String(quote.organiserPayoutMinor),
        // Issuance consumes this hold, so the seat moves from held to sold in one step
        // rather than being briefly free between the two.
        holdId,
        // Carried to issuance, which already writes one seat per ticket in order.
        seats: chosenSeats.join(','),
        // The priced basket, one entry per cart line. The webhook issues each entry as
        // its own payment event; empty on every non-cart path.
        cart: cartMetaValue,
        // Just the code. What it is worth is decided server-side at attribution time.
        ref: referral ?? '',
        // Set only on a season pass, which settles into one ticket per covered fixture.
        passId: String(form.get('passId') ?? ''),
        // The gift, kept apart from the ticket money all the way to the record.
        donationMinor: String(donationMinor),
        donationOrganiserId: donationMinor > 0 ? String(form.get('donationOrganiserId') ?? '') : '',
        // The registry contribution, carried to the webhook that moves the running total.
        registryItemId,
        registryMinor: String(registryMinor),
        registryMessage: String(form.get('registryMessage') ?? '').slice(0, 200),
      },
    });
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    // Stripe never got the buyer, so the seat must not stay reserved for fifteen
    // minutes on the strength of a checkout that failed to start.
    if (holdId) await releaseHold(holdId, 'abandoned');
    return fail(error instanceof Error ? error.message : 'Stripe checkout failed');
  }
}
