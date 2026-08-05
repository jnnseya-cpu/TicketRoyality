'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Megaphone,
  Menu,
  PlusCircle,
  Settings,
  Sparkles,
  TicketPercent,
  Tickets,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/common/Logo';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard/organiser', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/organiser/events', label: 'Events', icon: CalendarDays },
  { href: '/dashboard/organiser/tickets', label: 'Tickets & orders', icon: Tickets },
  { href: '/dashboard/organiser/coupons', label: 'Coupons', icon: TicketPercent },
  { href: '/dashboard/organiser/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/organiser/revenue', label: 'Revenue & payouts', icon: Wallet },
  { href: '/dashboard/organiser/promotions', label: 'Promotions', icon: Megaphone },
  { href: '/dashboard/organiser/ai-studio', label: 'AI studio', icon: Sparkles },
  { href: '/dashboard/organiser/settings', label: 'Settings', icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          item.href === '/dashboard/organiser'
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function OrganiserLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="container flex gap-8 py-8">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="flex items-center gap-2">
            <Logo className="h-5 w-5" />
            <span className="font-headline text-sm font-semibold">Organiser</span>
          </div>
          <Button variant="royal" size="sm" className="w-full" asChild>
            <Link href="/dashboard/organiser/events/new">
              <PlusCircle className="h-4 w-4" /> Create event
            </Link>
          </Button>
          <Separator />
          <NavLinks />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile nav trigger */}
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Menu className="h-4 w-4" /> Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Logo className="h-5 w-5" /> Organiser
                </SheetTitle>
                <SheetDescription>Manage events, tickets, revenue and promotion.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Button variant="royal" size="sm" className="w-full" asChild>
                  <Link href="/dashboard/organiser/events/new" onClick={() => setOpen(false)}>
                    <PlusCircle className="h-4 w-4" /> Create event
                  </Link>
                </Button>
                <Separator />
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {children}
      </div>
    </div>
  );
}
