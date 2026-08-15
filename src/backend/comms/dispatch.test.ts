/**
 * Dispatch tests. Run with: npm run test:comms
 *
 * These speak SMTP to a real in-process server rather than mocking nodemailer, for the
 * same reason `functions/src/delivery.test.ts` does: a mock asserts that the code calls
 * what the test author imagined, while a server catches a wrong port, a wrong TLS mode
 * or a message that never actually leaves.
 *
 * What matters here is the honesty of the outcome. Before this work `dispatch()`
 * returned `queued` for every channel and called nothing, so the platform believed it
 * had sent a hundred kinds of message it had never sent. The cases below pin down that
 * a status of `sent` means an SMTP server really received the mail, and that everything
 * which cannot be delivered says so.
 */
import { createServer, type Server } from 'node:net';
import assert from 'node:assert/strict';

interface Received {
  from: string;
  to: string[];
  data: string;
}

/**
 * A deliberately small SMTP server. Enough of the protocol for nodemailer to complete a
 * transaction and hand us the message.
 */
function smtpServer(): Promise<{ server: Server; port: number; received: Received[] }> {
  const received: Received[] = [];

  const server = createServer((socket) => {
    let current: Received = { from: '', to: [], data: '' };
    let inData = false;
    let buffer = '';

    socket.write('220 test.local ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      while (true) {
        const index = buffer.indexOf('\r\n');
        if (index === -1) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(current);
            current = { from: '', to: [], data: '' };
            socket.write('250 OK queued\r\n');
          } else {
            current.data += line + '\n';
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-test.local\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (upper.startsWith('AUTH')) {
          socket.write('235 authenticated\r\n');
        } else if (upper.startsWith('MAIL FROM')) {
          current.from = line.slice(line.indexOf(':') + 1).trim();
          socket.write('250 OK\r\n');
        } else if (upper.startsWith('RCPT TO')) {
          current.to.push(line.slice(line.indexOf(':') + 1).trim());
          socket.write('250 OK\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          socket.write('354 send it\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
    socket.on('error', () => {});
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as { port: number }).port, received });
    });
  });
}

const results: Array<[string, boolean, string]> = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push([name, true, '']);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push([name, false, message]);
    console.error(`  ✗ ${name}\n      ${message.split('\n')[0]}`);
  }
}

async function main() {
  const { server, port, received } = await smtpServer();

  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = 'info@ticketroyality.com';
  process.env.SMTP_PASSWORD = 'test-password';
  process.env.EMAIL_FROM = 'TicketRoyality <info@ticketroyality.com>';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ticketroyality.com';

  const { dispatch } = await import('./dispatch');
  const { resetTransport } = await import('./email');
  resetTransport();

  console.log('\nComms dispatch\n');

  await test('a real send reaches an SMTP server and is reported as sent', async () => {
    const before = received.length;
    const result = await dispatch({
      eventKey: 'order.refund.processed',
      recipient: { email: 'buyer@example.com' },
      vars: { amount: '£45.00' },
      body: ['Your refund of {{amount}} has been sent back to your card.'],
    });

    const email = result.records.find((r) => r.channel === 'email');
    assert.equal(email?.status, 'sent', `expected sent, got ${email?.status} (${email?.error})`);
    assert.equal(received.length, before + 1, 'exactly one message should have been transmitted');
    assert.ok(received.at(-1)!.to.includes('<buyer@example.com>'));
  });

  await test('the subject and body interpolate into the transmitted message', async () => {
    const before = received.length;
    await dispatch({
      eventKey: 'order.refund.processed',
      recipient: { email: 'buyer@example.com' },
      vars: { amount: '£99.50' },
      body: ['Your refund of {{amount}} has been sent back to your card.'],
    });
    const body = received.at(-1)!.data;
    assert.equal(received.length, before + 1);
    // Subjects are MIME-encoded when they carry a non-ASCII character such as £, so
    // assert on the decodable parts rather than the raw string.
    assert.ok(/Subject:/.test(body), 'message must carry a subject');
    assert.ok(body.includes('99.50') || body.includes('OTkuNTA') || /=A3?99/.test(body),
      'the interpolated amount must appear in the message');
  });

  await test('both a text and an HTML part are sent', async () => {
    await dispatch({
      eventKey: 'order.refund.processed',
      recipient: { email: 'buyer@example.com' },
      body: ['Plain and rich.'],
    });
    const body = received.at(-1)!.data;
    assert.ok(body.includes('text/plain'), 'a plain-text alternative is required');
    assert.ok(body.includes('text/html'), 'an HTML part is required');
  });

  await test('sandbox records without transmitting anything', async () => {
    const before = received.length;
    const result = await dispatch({
      eventKey: 'order.refund.processed',
      recipient: { email: 'buyer@example.com' },
      sandbox: true,
    });
    assert.equal(received.length, before, 'sandbox must not reach the SMTP server');
    assert.equal(result.records.find((r) => r.channel === 'email')?.status, 'logged');
  });

  await test('a recipient with no email address is suppressed, not failed', async () => {
    const result = await dispatch({
      eventKey: 'order.refund.processed',
      recipient: {},
    });
    const email = result.records.find((r) => r.channel === 'email');
    assert.equal(email?.status, 'suppressed');
    assert.match(email?.error ?? '', /No email address/i);
  });

  await test('sms and whatsapp report no provider rather than claiming a queue', async () => {
    const result = await dispatch({
      eventKey: 'auth.mfa.code',
      recipient: { email: 'x@example.com', phone: '+447700900000' },
      vars: { code: '482913' },
    });
    const sms = result.records.find((r) => r.channel === 'sms');
    assert.ok(sms, 'auth.mfa.code declares an sms channel');
    assert.equal(sms.status, 'suppressed', 'must not claim to be queued');
    assert.match(sms.error ?? '', /No approved provider/i);
  });

  await test('an unknown event key is refused', async () => {
    await assert.rejects(
      () => dispatch({ eventKey: 'not.a.real.event', recipient: { email: 'a@b.com' } }),
      /Unknown communication event/
    );
  });

  await test('a mandatory event ignores an opt-out', async () => {
    const before = received.length;
    const result = await dispatch({
      eventKey: 'order.refund.processed', // mandatory: true in the catalogue
      recipient: { email: 'buyer@example.com' },
      preferences: { email: false },
    });
    assert.ok(result.attempted.includes('email'), 'a contractual message cannot be opted out of');
    assert.equal(received.length, before + 1);
  });

  await test('an SMTP failure is reported as failed, and never thrown', async () => {
    resetTransport();
    const goodPort = process.env.SMTP_PORT;
    // Port 1 is reserved and refuses instantly, so this does not wait on a timeout.
    process.env.SMTP_PORT = '1';

    const result = await dispatch({
      eventKey: 'order.refund.processed',
      recipient: { email: 'buyer@example.com' },
    });
    const email = result.records.find((r) => r.channel === 'email');
    assert.equal(email?.status, 'failed', 'a dead SMTP server must be recorded as failed');
    assert.ok(email?.error, 'the reason must be recorded for support');

    process.env.SMTP_PORT = goodPort;
    resetTransport();
  });

  await test('unconfigured SMTP suppresses with a reason instead of pretending', async () => {
    resetTransport();
    const password = process.env.SMTP_PASSWORD;
    delete process.env.SMTP_PASSWORD;

    const result = await dispatch({
      eventKey: 'order.refund.processed',
      recipient: { email: 'buyer@example.com' },
    });
    const email = result.records.find((r) => r.channel === 'email');
    assert.equal(email?.status, 'suppressed');
    assert.match(email?.error ?? '', /not configured/i);

    process.env.SMTP_PASSWORD = password;
    resetTransport();
  });

  server.close();
  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
