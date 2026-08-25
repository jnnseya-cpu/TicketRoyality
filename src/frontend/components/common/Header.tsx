'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingCart,
  Ticket,
  User as UserIcon,
} from 'lucide-react';

import { Logo, Wordmark } from '@/frontend/components/common/Logo';
import { NotificationBell } from '@/frontend/components/common/NotificationBell';
import { ThemeToggle } from '@/frontend/components/common/ThemeToggle';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';
import { Separator } from '@/frontend/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/frontend/components/ui/sheet';
import { dashboardPathFor, useAuth } from '@/frontend/hooks/use-auth';
import { useCart } from '@/frontend/hooks/use-cart';
import { accountDisplayName, cn } from '@/shared/utils';

const NAV_LINKS = [
  { label: 'All Events', href: '/events' },
  { label: 'Organisers', href: '/organisers' },
  { label: 'Industries', href: '/industries' },
  { label: 'Developers', href: '/developers' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile, loading, logout } = useAuth();
  const { itemCount } = useCart();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
    router.push('/');
  };

  return (
    // data-app-header is the hook globals.css uses to add the status-bar inset in an
    // installed app, where the page renders behind the clock.
    <header
      data-app-header
      className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur-xl"
    >
      <div className="container flex h-16 items-center gap-4">
        {/*
          The brand is the one thing here that may shrink. Every control in this bar
          is sized in rem, so Android's text-size accessibility setting (which scales
          the root font) widens the whole row; without a shrinkable member the row
          outgrows the viewport and the clip guard cuts the menu button off the
          right edge. The wordmark truncating under large font scales is the
          graceful version of that trade.
        */}
        <Link href="/" className="flex min-w-0 shrink items-center gap-2">
          <Logo className="shrink-0" />
          <Wordmark className="min-w-0 truncate" />
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-primary',
                pathname.startsWith(link.href) ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Tighter gaps on a phone: this cluster is shrink-0, so every pixel it saves is a
            pixel the brand keeps before it has to truncate. */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Link href="/cart" className="relative" aria-label="Shopping cart">
            <Button variant="ghost" size="icon">
              <ShoppingCart className="h-4 w-4" />
            </Button>
            {itemCount > 0 && (
              <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]">
                {itemCount}
              </Badge>
            )}
          </Link>

          {/* Only renders for a signed-in user — see NotificationBell. */}
          <NotificationBell />

          {/* Theme toggle is a nicety, not a primary action — kept off the phone top bar
              (it lives in the menu sheet below) so a signed-in header of cart + bell +
              menu never outgrows a narrow screen. Shown inline from md up. */}
          <span className="hidden md:inline-flex">
            <ThemeToggle />
          </span>

          <div className="hidden md:flex md:items-center md:gap-2">
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {/* A plain <img>, not next/image: this is a 24px avatar inside a
                        button, and routing it through the optimiser would cost a
                        server render for something smaller than the icon it replaces. */}
                    {userProfile?.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={userProfile.logoUrl}
                        alt=""
                        className="-ml-1 h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <UserIcon className="h-4 w-4" />
                    )}
                    <span className="max-w-[10rem] truncate">
                      {accountDisplayName(userProfile ?? { email: user.email ?? undefined })}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium">{accountDisplayName(userProfile)}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={dashboardPathFor(userProfile?.userType)}>
                      <LayoutDashboard /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  {/*
                    Customers only. The wallet lives on the customer dashboard, which is
                    guarded by RequireRole, so this link was a guaranteed "wrong account
                    type" for every organiser and administrator who clicked it. A menu
                    item that can only fail is worse than a missing one.
                  */}
                  {userProfile?.userType === 'customer' && (
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/customer#tickets">
                        <Ticket /> My tickets
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Login</Link>
                </Button>
                <Button variant="royal" size="sm" asChild>
                  <Link href="/register">Sign up</Link>
                </Button>
              </>
            )}
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <div className="flex items-center justify-between gap-2">
                  <SheetTitle className="flex items-center gap-2">
                    <Logo className="h-5 w-5" />
                    Menu
                  </SheetTitle>
                  {/* The theme toggle lives here on mobile — off the cramped top bar. */}
                  <ThemeToggle />
                </div>
                <SheetDescription>Browse events, manage your account and tickets.</SheetDescription>
              </SheetHeader>

              <nav className="mt-6 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-secondary"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/how-it-works"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-secondary"
                >
                  How it works
                </Link>
                <Link
                  href="/about-us"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-secondary"
                >
                  About us
                </Link>
              </nav>

              <Separator className="my-6" />

              {user ? (
                <div className="flex flex-col gap-2">
                  <Button asChild onClick={() => setMobileOpen(false)}>
                    <Link href={dashboardPathFor(userProfile?.userType)}>Go to dashboard</Link>
                  </Button>
                  <Button variant="outline" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button variant="royal" asChild onClick={() => setMobileOpen(false)}>
                    <Link href="/register">Create account</Link>
                  </Button>
                  <Button variant="outline" asChild onClick={() => setMobileOpen(false)}>
                    <Link href="/login">Login</Link>
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
