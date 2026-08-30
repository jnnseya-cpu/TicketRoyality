import Link from 'next/link';

import { Logo, Wordmark } from '@/frontend/components/common/Logo';
import { Separator } from '@/frontend/components/ui/separator';

/**
 * Public destinations only.
 *
 * `/dev-access` and `/dashboard/organiser` used to sit here and were removed: both
 * redirect to a login, so as footer navigation they are two dead ends on every page of
 * the site. Someone who needs a dashboard reaches it from the header once signed in.
 */
const COLUMNS = [
  {
    title: 'System Nodes',
    links: [
      { label: 'All Events', href: '/events' },
      { label: 'Verified Organisers', href: '/organisers' },
      { label: 'Industries', href: '/industries' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about-us' },
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Developers', href: '/developers' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Organise & grow',
    links: [
      { label: 'Get started', href: '/get-started' },
      { label: 'Growth & Influencers', href: '/growth' },
      { label: 'Launch your event', href: '/register/organiser' },
    ],
  },
  {
    title: 'Legal & Security',
    links: [
      { label: 'Privacy Policy', href: '/privacy-policy' },
      { label: 'Terms of Service', href: '/terms-of-service' },
      { label: 'All policies', href: '/policies' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="container py-10">
        {/*
          Two columns on phones rather than four stacked blocks. Stacked, the four link
          lists made the footer over 1100px tall — taller than the viewport it sits
          under, so every page ended in a long scroll through navigation.
        */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-10">
          <div className="col-span-2 space-y-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
              <Wordmark />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              The premium infrastructure operating system for serious events. From stadiums to
              festivals, we orchestrate the future of ticketing.
            </p>
            {/* Only real, working contact routes here — no placeholder social icons pointing at
                bare twitter.com / linkedin.com. Real profile links go back the moment there are
                accounts to link; the mailbox below is the live info@ SMTP inbox. */}
            <a
              href="mailto:info@ticketroyality.com"
              className="block text-sm text-primary underline-offset-4 hover:underline"
            >
              info@ticketroyality.com
            </a>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title} className="space-y-2">
              <h4 className="text-sm font-semibold">{column.title}</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className="transition-colors hover:text-primary">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
          <p className="font-headline text-sm font-semibold">Where Every Ticket Feels Royal.</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            &copy; 2026 TicketRoyality · All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
}
