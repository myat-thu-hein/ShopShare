import Link from 'next/link';
import { Logo } from './logo';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-xs space-y-3">
          <Logo />
          <p className="text-sm text-muted-fg">
            A multi-vendor marketplace where you describe what you want in your own words. A portfolio project
            — payments run in Stripe test mode.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="font-display text-base">Shop</h2>
          <Link href="/c/shoes" className="block text-muted-fg hover:text-ink">
            Shoes
          </Link>
          <Link href="/c/electronics" className="block text-muted-fg hover:text-ink">
            Electronics
          </Link>
          <Link href="/search?q=gifts%20under%20500%20baht" className="block text-muted-fg hover:text-ink">
            Gifts under ฿500
          </Link>
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="font-display text-base">Sell</h2>
          <Link href="/register?role=seller" className="block text-muted-fg hover:text-ink">
            Open a store
          </Link>
          <Link prefetch={false} href="/seller" className="block text-muted-fg hover:text-ink">
            Seller dashboard
          </Link>
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="font-display text-base">Developers</h2>
          <a href="/api/docs" className="block text-muted-fg hover:text-ink">
            API documentation
          </a>
          <Link href="/login" className="block text-muted-fg hover:text-ink">
            Try the demo accounts
          </Link>
        </div>
      </div>
    </footer>
  );
}
