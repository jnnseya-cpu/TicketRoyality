import Link from 'next/link';
import { Activity, Linkedin, Twitter } from 'lucide-react';

import { Logo, Wordmark } from '@/frontend/components/common/Logo';
import { Separator } from '@/frontend/components/ui/separator';

const COLUMNS = [
  {
    title: 'System Nodes',
    links: [
      { label: 'All Events', href: '/events' },
      { label: 'Verified Organisers', href: '/organisers' },
      { label: 'Industries', href: '/industries' },
      { label: 'Blog', href: '/blog' },
      { label: 'Dev Access Portal', href: '/dev-access' },
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
      { label: 'Organiser dashboard', href: '/dashboard/organiser' },
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
      <div className="container py-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
              <Wordmark />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              The premium infrastructure operating system for serious events. From stadiums to
              festivals, we orchestrate the future of ticketing.
            </p>
            <a
              href="mailto:info@ticketroyality.com"
              className="block text-sm text-primary underline-offset-4 hover:underline"
            >
              info@ticketroyality.com
            </a>
            <div className="flex gap-3 text-muted-foreground">
              <Link href="https://twitter.com" aria-label="Twitter / X" className="hover:text-primary">
                <Twitter className="h-4 w-4" />
              </Link>
              <Link href="https://linkedin.com" aria-label="LinkedIn" className="hover:text-primary">
                <Linkedin className="h-4 w-4" />
              </Link>
              <Link href="/how-it-works" aria-label="System status" className="hover:text-primary">
                <Activity className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title} className="space-y-3">
              <h4 className="text-sm font-semibold">{column.title}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
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

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <p className="font-headline text-sm font-semibold">Where Every Ticket Feels Royal.</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            &copy; 2026 TicketRoyality · All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
}
