import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { AssistantWidget } from '@/components/assistant-widget';
import { SITE_URL } from '@/lib/utils';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'ShopShare — describe it, find it', template: '%s · ShopShare' },
  description:
    'A Thai multi-vendor marketplace with AI search. Type what you want in your own words — "red running shoes under 2000 baht for wide feet" — and get the right products.',
  openGraph: { type: 'website', siteName: 'ShopShare', locale: 'en_TH' },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#12142a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Providers>
          <Header />
          <main id="main" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
            {children}
          </main>
          <Footer />
          <AssistantWidget />
        </Providers>
      </body>
    </html>
  );
}
