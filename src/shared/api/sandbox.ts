/**
 * Sandbox fixtures.
 *
 * ## Why the sandbox returns invented data rather than a copy of the account
 *
 * An integrator building against real records is one mistake away from a script that
 * cancels real orders or emails real attendees while they are still learning the shape of
 * the API. So a `tr_test_…` key reads from here and touches nothing: the data is stable,
 * obviously fake (nobody is called "Sandbox Attendee"), and covers the cases that break
 * integrations — a sold-out tier, a refunded ticket, a free ticket, a seat, a redeemed
 * pass — which a fresh live account has none of.
 *
 * The shapes are the same as live, deliberately, so moving to a live key changes the
 * key and nothing else.
 */

export const SANDBOX_EVENTS = [
  {
    id: 'evt_sandbox_gala',
    title: 'Sandbox Charity Gala',
    status: 'published',
    date: '2030-06-18T19:00:00.000Z',
    location: 'The Sandbox Rooms, London',
    currency: 'GBP',
    ticketTiers: [
      { id: 'tier_standard', name: 'Standard', price: 45, quantity: 200, sold: 137 },
      // Deliberately sold out: the case an integration forgets until it is live.
      { id: 'tier_vip', name: 'VIP Table', price: 250, quantity: 10, sold: 10 },
      { id: 'tier_free', name: 'Volunteer', price: 0, quantity: 25, sold: 4 },
    ],
  },
  {
    id: 'evt_sandbox_matinee',
    title: 'Sandbox Matinee',
    status: 'published',
    date: '2030-07-02T14:30:00.000Z',
    location: 'Sandbox Playhouse, Manchester',
    currency: 'GBP',
    ticketTiers: [{ id: 'tier_stalls', name: 'Stalls', price: 22, quantity: 300, sold: 61 }],
  },
] as const;

export const SANDBOX_TICKETS = [
  {
    id: 'tkt_sandbox_1',
    reference: 'TR-SBX001',
    eventId: 'evt_sandbox_gala',
    tierId: 'tier_standard',
    tierName: 'Standard',
    attendeeName: 'Sandbox Attendee',
    attendeeEmail: 'attendee@sandbox.invalid',
    price: 45,
    currency: 'GBP',
    status: 'valid',
    seat: null,
    purchasedAt: '2030-01-04T10:15:00.000Z',
  },
  {
    id: 'tkt_sandbox_2',
    reference: 'TR-SBX002',
    eventId: 'evt_sandbox_gala',
    tierId: 'tier_vip',
    tierName: 'VIP Table',
    attendeeName: 'Sandbox Guest',
    attendeeEmail: 'guest@sandbox.invalid',
    price: 250,
    currency: 'GBP',
    // Already through the door: the state that breaks naive "mark as used" code.
    status: 'redeemed',
    seat: 'A12',
    purchasedAt: '2030-01-05T09:00:00.000Z',
  },
  {
    id: 'tkt_sandbox_3',
    reference: 'TR-SBX003',
    eventId: 'evt_sandbox_matinee',
    tierId: 'tier_stalls',
    tierName: 'Stalls',
    attendeeName: 'Sandbox Refund',
    attendeeEmail: 'refund@sandbox.invalid',
    price: 22,
    currency: 'GBP',
    // Refunded tickets still exist and must not be counted as attendance.
    status: 'refunded',
    seat: 'F4',
    purchasedAt: '2030-01-06T18:40:00.000Z',
  },
] as const;

/** The `.invalid` TLD is reserved by the IETF, so a sandbox email can never be delivered. */
export const SANDBOX_NOTE =
  'Sandbox data. Nothing here is real, nothing is stored, and the addresses are on the ' +
  'reserved .invalid domain so no message sent to them can leave your own machine.';
