'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { useTheme } from 'next-themes';
import {
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Shield,
  ShoppingBag,
  Store,
  Sun,
  Truck,
  User,
} from 'lucide-react';
import { Logo } from './logo';
import { SearchBox } from './search-box';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown';
import { useSession } from '@/hooks/use-session';
import { useCart } from '@/hooks/use-cart';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

function CartButton() {
  const { itemCount } = useCart();
  return (
    <Button variant="ghost" size="icon" asChild>
      <Link href="/cart" aria-label={`Cart, ${itemCount} items`} className="relative">
        <ShoppingBag />
        {itemCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-marigold px-1 text-[11px] font-bold text-marigold-fg">
            {itemCount}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

function UserMenu() {
  const { user, status, logout } = useSession();
  if (status === 'loading') return <div className="size-10" />;
  if (!user) {
    return (
      <Button asChild variant="outline" size="sm" className="h-9">
        <Link href="/login">Log in</Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <span className="grid size-8 place-items-center rounded-full bg-ink font-display text-sm font-bold text-paper">
            {user.name.charAt(0).toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block font-medium text-ink">{user.name}</span>
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === 'SELLER' || user.role === 'ADMIN' ? (
          <DropdownMenuItem asChild>
            <Link prefetch={false} href="/seller">
              <LayoutDashboard />
              Seller dashboard
            </Link>
          </DropdownMenuItem>
        ) : null}
        {user.role === 'ADMIN' ? (
          <DropdownMenuItem asChild>
            <Link prefetch={false} href="/admin">
              <Shield />
              Admin
            </Link>
          </DropdownMenuItem>
        ) : null}
        {user.sellerSlug ? (
          <DropdownMenuItem asChild>
            <Link prefetch={false} href={`/store/${user.sellerSlug}`}>
              <Store />
              My store page
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link prefetch={false} href="/orders">
            <Package />
            Orders
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link prefetch={false} href="/wishlist">
            <Heart />
            Wishlist
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link prefetch={false} href="/profile">
            <User />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const NAV = [
  { href: '/c/electronics', label: 'Electronics' },
  { href: '/c/fashion', label: 'Fashion' },
  { href: '/c/shoes', label: 'Shoes' },
  { href: '/c/bags-accessories', label: 'Bags & Accessories' },
  { href: '/c/watches', label: 'Watches' },
  { href: '/c/beauty', label: 'Beauty' },
  { href: '/c/home-kitchen', label: 'Home & Kitchen' },
  { href: '/c/sports-outdoors', label: 'Sports' },
];

export function Header() {
  const pathname = usePathname();
  const showSearch = pathname !== '/';
  return (
    <>
      <div className="bg-ink text-paper">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-4 px-4 text-xs sm:px-6">
          <p className="flex items-center gap-1.5">
            <Truck className="size-3.5 text-marigold" aria-hidden />
            Free shipping on every order. Pay safely with Stripe.
          </p>
          <nav aria-label="Shortcuts" className="hidden items-center gap-5 sm:flex">
            <Link prefetch={false} href="/register?role=seller" className="hover:text-marigold">
              Sell on ShopShare
            </Link>
            <Link href="/deals" className="hover:text-marigold">
              Today’s deals
            </Link>
            <a href="/api/docs" className="hover:text-marigold">
              API docs
            </a>
          </nav>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </DialogTrigger>
            <DialogContent title="Browse" side="left">
              <nav className="flex flex-col gap-1">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 hover:bg-muted">
                    {n.label}
                  </Link>
                ))}
              </nav>
            </DialogContent>
          </Dialog>
          <Logo className="shrink-0" />
          <div className={cn('mx-2 hidden flex-1 md:block', !showSearch && 'invisible')}>
            <Suspense>
              <SearchBox />
            </Suspense>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <CartButton />
            <UserMenu />
          </div>
        </div>
        <nav
          aria-label="Categories"
          className="mx-auto hidden h-10 max-w-7xl items-center gap-6 px-6 text-sm lg:flex"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'text-muted-fg hover:text-ink',
                pathname.startsWith(n.href) && 'font-medium text-ink',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {showSearch ? (
          <div className="px-4 pb-3 md:hidden">
            <Suspense>
              <SearchBox />
            </Suspense>
          </div>
        ) : null}
      </header>
    </>
  );
}
