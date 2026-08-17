import 'server-only';

import { getAdminDb, isAdminConfigured } from '@/backend/firebase/admin';
import { computeOrderFees, toMinor, type Health } from '@/shared/fees';

/**
 * Unit economics, from real orders.
 *
 * Every figure is a live read of `issued_payments` and the tickets it produced. Nothing
 * here is projected, and an unreachable database yields an unavailable report rather
 * than a confident zero — the same rule as the operations console, and for the same
 * reason: a zero that means "we could not look" is worse than no number when the
 * question is whether the platform is making money.
 *
 * ## Two costs, deliberately
 *
 * `attributable` is the cost of earning the fee — the basis the 2× cost multiple is
 * measured against. `full` applies the payment rail's percentage to the whole charge,
 * face value included, which is what the processor actually bills.
 *
 * They differ, and the difference is the entire economics of the zero-commission model:
 * processing on the organiser's money is the priced cost of "keep 100%". Reporting only
 * the first would let the platform read healthy while losing money on every
 * high-value international card.
 */

export interface ProfitabilityReport {
  generatedAt: string;
  available: boolean;
  reason?: string;
  orders: number;
  ticketsSold: number;

  /** Gross merchandise value — face value across all orders. The organiser's money. */
  gmvMinor: number;
  /** What was actually paid out. Equals GMV under the zero-commission model. */
  organiserPayoutMinor: number;
  serviceFeeMinor: number;
  serviceFeeNetMinor: number;
  vatOnFeeMinor: number;

  attributableCostMinor: number;
  fullCostMinor: number;
  grossContributionMinor: number;
  netContributionMinor: number;

  /** Revenue ÷ attributable cost, blended. `null` when nothing has sold. */
  costMultiple: number | null;
  health: Health | null;

  revenuePerTicketMinor: number;
  costPerTicketMinor: number;
  profitPerTicketMinor: number;

  /** Orders that did not cover their own full cost. The list that matters. */
  lossMakingOrders: number;
}

const LIMIT = 500;

function unavailable(reason: string): ProfitabilityReport {
  return {
    generatedAt: new Date().toISOString(),
    available: false,
    reason,
    orders: 0,
    ticketsSold: 0,
    gmvMinor: 0,
    organiserPayoutMinor: 0,
    serviceFeeMinor: 0,
    serviceFeeNetMinor: 0,
    vatOnFeeMinor: 0,
    attributableCostMinor: 0,
    fullCostMinor: 0,
    grossContributionMinor: 0,
    netContributionMinor: 0,
    costMultiple: null,
    health: null,
    revenuePerTicketMinor: 0,
    costPerTicketMinor: 0,
    profitPerTicketMinor: 0,
    lossMakingOrders: 0,
  };
}

export async function profitabilityReport(now = new Date()): Promise<ProfitabilityReport> {
  if (!isAdminConfigured()) {
    return unavailable('The Admin SDK is not configured on this deployment.');
  }

  const db = getAdminDb();

  try {
    const issued = await db.collection('issued_payments').limit(LIMIT).get();

    const report = unavailable('');
    report.available = true;
    report.reason = undefined;
    report.generatedAt = now.toISOString();

    for (const doc of issued.docs) {
      const marker = doc.data() as { ticketIds?: string[] };
      const ticketIds = marker.ticketIds ?? [];
      if (ticketIds.length === 0) continue;

      const tickets = (
        await db.getAll(...ticketIds.map((id) => db.collection('tickets').doc(id)))
      )
        .filter((snap) => snap.exists)
        .map((snap) => snap.data() as { price?: number });

      if (tickets.length === 0) continue;

      /*
       * Recomputed from the tickets rather than read from a stored quote.
       *
       * That is a known compromise and it is worth naming: orders placed before the
       * pricing snapshot lands carry no quote, so recomputation is the only way to
       * report on them at all. It means a historical order is described using today's
       * config, which is exactly what §16 forbids for accounting. Once every order
       * carries its own snapshot this should read that instead — the field is already
       * written into the Stripe session metadata.
       */
      const quote = computeOrderFees(
        tickets.map((ticket) => ({ faceMinor: toMinor(ticket.price ?? 0), qty: 1 }))
      );

      report.orders += 1;
      report.ticketsSold += tickets.length;
      report.gmvMinor += quote.faceMinor;
      report.organiserPayoutMinor += quote.organiserPayoutMinor;
      report.serviceFeeMinor += quote.serviceFeeMinor;
      report.serviceFeeNetMinor += quote.serviceFeeNetMinor;
      report.vatOnFeeMinor += quote.vatOnFeeMinor;
      report.attributableCostMinor += quote.economics.directCostMinor;
      report.fullCostMinor += quote.economics.fullCostMinor;
      if (!quote.economics.netProfitable) report.lossMakingOrders += 1;
    }

    report.grossContributionMinor = report.serviceFeeNetMinor - report.attributableCostMinor;
    report.netContributionMinor = report.serviceFeeNetMinor - report.fullCostMinor;

    report.costMultiple =
      report.attributableCostMinor === 0
        ? null
        : report.serviceFeeNetMinor / report.attributableCostMinor;

    report.health =
      report.costMultiple === null
        ? null
        : report.netContributionMinor < 0
          ? 'loss'
          : report.costMultiple >= 2
            ? 'healthy'
            : report.costMultiple >= 1.5
              ? 'warning'
              : 'critical';

    if (report.ticketsSold > 0) {
      report.revenuePerTicketMinor = Math.round(report.serviceFeeNetMinor / report.ticketsSold);
      report.costPerTicketMinor = Math.round(report.fullCostMinor / report.ticketsSold);
      report.profitPerTicketMinor = Math.round(report.netContributionMinor / report.ticketsSold);
    }

    return report;
  } catch (error) {
    console.error('[profitability] report failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return unavailable('Could not read the payment collections.');
  }
}
