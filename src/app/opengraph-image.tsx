import { ImageResponse } from 'next/og';

/**
 * The social-share card — the `og:image` a link renders as on WhatsApp, Facebook, LinkedIn
 * and X. Generated at 1200×630 (the size those platforms crop to) from the brand palette,
 * so there is nothing to keep in sync in `/public`. Next wires this in as `og:image`
 * automatically; `twitter-image.tsx` re-exports it for the Twitter card.
 */

// Node runtime, not edge: App Hosting serves the standalone Node server (Cloud Run), where
// the edge runtime isn't what runs.
export const runtime = 'nodejs';
export const alt = 'TicketRoyality — Premium Event Access. Verified Tickets.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          background: '#14100b',
          color: '#e9e1cf',
          fontFamily: 'Georgia, serif',
          border: '10px solid #b8860b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, letterSpacing: 8, color: '#caa24a', textTransform: 'uppercase' }}>
          👑&nbsp;&nbsp;Premium event access
        </div>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, marginTop: 24, lineHeight: 1.05 }}>
          Ticket<span style={{ color: '#c0546a' }}>Royality</span>
        </div>
        <div style={{ display: 'flex', fontSize: 40, marginTop: 30, color: '#cabfa6', maxWidth: 950 }}>
          Sell out the room. Keep every penny of face. Verified QR tickets, 0% organiser
          commission.
        </div>
      </div>
    ),
    { ...size }
  );
}
