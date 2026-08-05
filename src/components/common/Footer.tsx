import Link from 'next/link';
import { Facebook, Instagram, Twitter } from 'lucide-react';

import { Logo, Wordmark } from '@/components/common/Logo';
import { Separator } from '@/components/ui/separator';

const COLUMNS = [
  {
    title: 'Discover',
    links: [
      { label: 'All events', href: '/events' },
      { label: 'Organisers', href: '/organisers' },
      { label: 'Event calendar', href: '/events?view=calendar' },
    ],
  },
  {
    title: 'Organise',
    links: [
      { label: 'Launch your event', href: '/register/organiser' },
      { label: 'Organiser dashboard', href: '/dashboard/organiser' },
      { label: 'Pricing & commission', href: '/how-it-works#pricing' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'About us', href: '/about-us' },
      { label: 'Developer access', href: '/dev-access' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of service', href: '/terms-of-service' },
      { label: 'Privacy policy', href: '/privacy-policy' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="container py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
              <Wordmark />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              Premium event access. Verified tickets. Royal experience. Built for stadiums,
              festivals, clubs, promoters and VIP events.
            </p>
            <div className="flex gap-3 text-muted-foreground">
              <Link href="https://facebook.com" aria-label="Facebook" className="hover:text-primary">
                <Facebook className="h-4 w-4" />
              </Link>
              <Link href="https://instagram.com" aria-label="Instagram" className="hover:text-primary">
                <Instagram className="h-4 w-4" />
              </Link>
              <Link href="https://twitter.com" aria-label="Twitter" className="hover:text-primary">
                <Twitter className="h-4 w-4" />
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

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {2026} TicketRoyality. All rights reserved.</p>
          <p>Secure QR access · Real-time entry control · Premium fan experience</p>
        </div>
      </div>
    </footer>
  );
}
