import 'server-only';

/**
 * Bitripay adapter. Two server-to-server calls — authenticate, then create a payment.
 * Credentials never leave this process.
 */

const DEFAULT_BASE_URL = 'https://bitripay.com/pay/sandbox/api/v1';

export function isBitripayConfigured() {
  return Boolean(process.env.BITRIPAY_CLIENT_ID && process.env.BITRIPAY_SECRET_ID);
}

interface TokenResponse {
  data?: { access_token?: string; expire_time?: number };
  message?: { error?: string[] };
}

interface PaymentResponse {
  data?: { payment_url?: string; token?: string };
  message?: { error?: string[] };
}

function baseUrl() {
  return process.env.BITRIPAY_BASE_URL ?? DEFAULT_BASE_URL;
}

/** Access tokens are short-lived (600s), so they are fetched per request, not cached. */
async function accessToken(): Promise<string> {
  const response = await fetch(`${baseUrl()}/authentication/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.BITRIPAY_CLIENT_ID,
      secret_id: process.env.BITRIPAY_SECRET_ID,
    }),
  });

  const json = (await response.json()) as TokenResponse;
  const token = json.data?.access_token;
  if (!token) throw new Error(json.message?.error?.[0] ?? 'Bitripay authentication failed.');
  return token;
}

export interface BitripayRequest {
  amount: number;
  currency: string;
  reference: string;
  returnUrl: string;
  cancelUrl: string;
}

export async function createPayment(
  request: BitripayRequest
): Promise<{ paymentUrl: string; token?: string }> {
  const token = await accessToken();

  const response = await fetch(`${baseUrl()}/payment/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: request.amount.toFixed(2),
      currency: request.currency,
      return_url: request.returnUrl,
      cancel_url: request.cancelUrl,
      custom: request.reference,
    }),
  });

  const json = (await response.json()) as PaymentResponse;
  const paymentUrl = json.data?.payment_url;
  if (!paymentUrl) {
    throw new Error(json.message?.error?.[0] ?? 'Bitripay did not return a payment URL.');
  }
  return { paymentUrl, token: json.data?.token };
}
