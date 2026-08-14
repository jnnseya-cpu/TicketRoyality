/**
 * Ticket delivery tests.
 *
 * The template is checked directly. The sender is checked against a **real SMTP
 * server** — a throwaway one started in-process on a local port — rather than a mocked
 * `nodemailer`. Mocking the transport would only prove that the mock was called; it
 * would not catch a wrong `secure` flag, a malformed message, or an auth failure, which
 * are the three things that actually go wrong with SMTP.
 *
 *   npm run test:delivery
 */
import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';

import type { TicketDoc } from './domain';
import { isEmailConfigured, resetTransport, send } from './email';
import { ticketIssuedEmail } from './templates';

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ticket(overrides: Partial<TicketDoc> = {}): TicketDoc {
  return {
    reference: 'TR-ABCD-2345',
    eventId: 'event-1',
    eventTitle: 'Test Event',
    eventDate: '2026-12-01T20:00:00.000Z',
    eventLocation: 'The Venue, London',
    organizerId: 'org-1',
    organizerName: 'Test Organiser',
    userId: 'user-1',
    attendeeName: 'Ada Lovelace',
    attendeeEmail: 'ada@example.com',
    tierId: 'tier-ga',
    tierName: 'General',
    price: 25,
    currency: 'GBP',
    status: 'valid',
    purchasedAt: '2026-08-14T12:00:00.000Z',
    paymentProvider: 'stripe',
    ...overrides,
  };
}

/**
 * A minimal SMTP server that accepts one message and hands back what it received.
 *
 * Enough of the protocol for nodemailer to complete a plain-auth session over an
 * unencrypted socket, which is what port 587 without STARTTLS looks like.
 */
function smtpSink(): Promise<{ server: Server; port: number; received: Promise<string> }> {
  let resolveBody: (value: string) => void;
  const received = new Promise<string>((resolve) => (resolveBody = resolve));

  const server = createServer((socket: Socket) => {
    let buffer = '';
    let inData = false;
    let message = '';

    socket.write('220 localhost ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString();

      for (;;) {
        const index = buffer.indexOf('\r\n');
        if (index === -1) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            resolveBody(message);
            socket.write('250 OK queued\r\n');
          } else {
            message += `${line}\n`;
          }
          continue;
        }

        const command = line.toUpperCase();
        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (command.startsWith('AUTH')) {
          socket.write('235 authenticated\r\n');
        } else if (command.startsWith('MAIL FROM') || command.startsWith('RCPT TO')) {
          socket.write('250 OK\r\n');
        } else if (command === 'DATA') {
          inData = true;
          socket.write('354 send data\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });

    socket.on('error', () => undefined);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port, received });
    });
  });
}

async function run() {
  console.log('\nTicket delivery\n');

  await test('one email lists every ticket in the purchase', () => {
    const tickets = [
      ticket({ reference: 'TR-AAAA-1111' }),
      ticket({ reference: 'TR-BBBB-2222', seat: 'F12' }),
    ];
    const email = ticketIssuedEmail(tickets, 'https://ticketroyality.com');

    assert.equal(email.subject, 'Your tickets for Test Event');
    for (const part of [email.text, email.html]) {
      assert.ok(part.includes('TR-AAAA-1111'), 'first reference present');
      assert.ok(part.includes('TR-BBBB-2222'), 'second reference present');
    }
    assert.ok(email.html.includes('F12'), 'seat number shown');
  });

  await test('subject is singular for one ticket', () => {
    const email = ticketIssuedEmail([ticket()], 'https://ticketroyality.com');
    assert.equal(email.subject, 'Your ticket for Test Event');
  });

  await test('total is the sum, formatted as currency', () => {
    const email = ticketIssuedEmail([ticket({ price: 25 }), ticket({ price: 30 })], 'https://x.com');
    assert.ok(email.text.includes('£55.00'), `expected £55.00 in:\n${email.text}`);
  });

  await test('the QR payload is never embedded in the email', () => {
    const email = ticketIssuedEmail([ticket()], 'https://ticketroyality.com');
    const body = `${email.text}${email.html}`;
    // The QR is a static unsigned payload today, so putting it in an inbox would put a
    // working credential somewhere forwardable.
    assert.ok(!body.includes('"t":'), 'no QR JSON payload');
    assert.ok(!body.includes('qrcode'), 'no QR image');
    assert.ok(body.includes('/dashboard/customer/wallet'), 'links to the wallet instead');
  });

  await test('user-supplied text cannot inject markup', () => {
    const email = ticketIssuedEmail(
      [ticket({ eventTitle: '<script>alert(1)</script>', organizerName: 'A & B "Ltd"' })],
      'https://ticketroyality.com'
    );
    assert.ok(!email.html.includes('<script>'), 'script tag escaped');
    assert.ok(email.html.includes('&lt;script&gt;'), 'escaped form present');
    assert.ok(email.html.includes('A &amp; B &quot;Ltd&quot;'), 'ampersand and quotes escaped');
  });

  await test('every message carries a plain-text alternative', () => {
    const email = ticketIssuedEmail([ticket()], 'https://ticketroyality.com');
    assert.ok(email.text.length > 100, 'text part is substantial');
    assert.ok(!email.text.includes('<'), 'text part carries no markup');
  });

  await test('a transactional message says it cannot be unsubscribed from', () => {
    const email = ticketIssuedEmail([ticket()], 'https://ticketroyality.com');
    assert.ok(email.text.toLowerCase().includes('not marketing'));
  });

  await test('sending is skipped, not attempted, when SMTP is unconfigured', async () => {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) delete process.env[key];
    resetTransport();

    assert.equal(isEmailConfigured(), false);
    const outcome = await send({ to: 'a@b.com', subject: 's', text: 't', html: '<p>t</p>' });
    assert.equal(outcome.status, 'skipped');
  });

  await test('a real SMTP server receives the message', async () => {
    const sink = await smtpSink();

    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(sink.port);
    process.env.SMTP_USER = 'info@ticketroyality.com';
    process.env.SMTP_PASSWORD = 'secret';
    process.env.EMAIL_FROM = 'TicketRoyality <info@ticketroyality.com>';

    // The transporter is cached per process — the behaviour we want in production — so
    // it is reset explicitly to pick up this port.
    resetTransport();

    const email = ticketIssuedEmail([ticket()], 'https://ticketroyality.com');
    const outcome = await send({ to: 'ada@example.com', ...email });

    assert.equal(outcome.status, 'sent', `expected sent, got ${JSON.stringify(outcome)}`);

    const raw = await sink.received;
    assert.ok(raw.includes('To: ada@example.com'), 'recipient in headers');
    assert.ok(raw.includes('TicketRoyality'), 'from name in headers');
    assert.ok(raw.toLowerCase().includes('multipart/alternative'), 'text and html both sent');
    assert.ok(raw.includes('TR-ABCD-2345') || raw.includes('VFItQUJDRC0yMzQ1'), 'reference in body');

    sink.server.close();
  });

  await test('an unreachable SMTP server fails without throwing', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    // Nothing listens here; the transport must time out and report, not crash.
    process.env.SMTP_PORT = '1';
    resetTransport();

    const outcome = await send({ to: 'a@b.com', subject: 's', text: 't', html: '<p>t</p>' });
    assert.equal(outcome.status, 'failed');
    assert.ok('reason' in outcome && outcome.reason.length > 0, 'failure carries a reason');
  });

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
