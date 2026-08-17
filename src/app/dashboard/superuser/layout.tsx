'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BadgeCheck,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Percent,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { Logo } from '@/frontend/components/common/Logo';
import { Separator } from '@/frontend/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/frontend/components/ui/sheet';
import { cn } from '@/shared/utils';

const NAV = [
  { href: '/dashboard/superuser', label: 'Overview', icon: LayoutDashboard },
  // Second, deliberately. It is the only page that answers "did somebody pay and
  // get nothing?", which is the question that costs money while nobody is looking.
  { href: '/dashboard/superuser/operations', label: 'Operations', icon: Activity },
  { href: '/dashboard/superuser/users', label: 'Accounts', icon: Users },
  { href: '/dashboard/superuser/approvals', label: 'Organiser approvals', icon: BadgeCheck },
  { href: '/dashboard/superuser/offline-payments', label: 'Offline payments', icon: Smartphone },
  { href: '/dashboard/superuser/profitability', label: 'Unit economics', icon: TrendingUp },
  { href: '/dashboard/superuser/commissions', label: 'Commissions', icon: Percent },
  { href: '/dashboard/superuser/acu', label: 'ACU console', icon: Sparkles },
  // Was built and then orphaned: the page existed but nothing linked to it, so it was
  // reachable only by typing the URL.
  { href: '/dashboard/superuser/comms', label: 'Communications', icon: MessageSquare },
  { href: '/dashboard/superuser/profile', label: 'My profile', icon: UserCog },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          item.href === '/dashboard/superuser'
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

export default function SuperuserLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="container flex gap-8 py-8">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="flex items-center gap-2">
            <Logo className="h-5 w-5" />
            <span className="font-headline text-sm font-semibold">Platform admin</span>
          </div>
          <Separator />
          <NavLinks />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Menu className="h-4 w-4" /> Admin menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Logo className="h-5 w-5" /> Platform admin
                </SheetTitle>
                <SheetDescription>
                  Approvals, payments, commission and credit administration.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
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
