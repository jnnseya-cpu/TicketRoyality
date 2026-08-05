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
import { cn } from '@/shared/utils';

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
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <Wordmark />
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

        <div className="ml-auto flex items-center gap-2">
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

          <ThemeToggle />

          <div className="hidden md:flex md:items-center md:gap-2">
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <UserIcon className="h-4 w-4" />
                    <span className="max-w-[10rem] truncate">
                      {userProfile?.fullName ?? user.email}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium">{userProfile?.fullName ?? 'Account'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={dashboardPathFor(userProfile?.userType)}>
                      <LayoutDashboard /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/customer#tickets">
                      <Ticket /> My tickets
                    </Link>
                  </DropdownMenuItem>
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
                <SheetTitle className="flex items-center gap-2">
                  <Logo className="h-5 w-5" />
                  Menu
                </SheetTitle>
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
