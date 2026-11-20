import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { ProductImage } from '../product-image';

export interface StoreSummary {
  storeName: string;
  slug: string;
  description: string | null;
  productCount: number;
  images: string[];
}

export function StoreShowcase({ stores }: { stores: StoreSummary[] }) {
  if (!stores.length) return null;
  return (
    <section aria-labelledby="stores" className="mt-14">
      <h2 id="stores" className="mb-1 text-2xl">
        Official stores
      </h2>
      <p className="mb-5 text-sm text-muted-fg">Every seller is reviewed by our team before they can sell.</p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/store/${s.slug}`}
              className="block rounded-2xl border border-line bg-surface p-4 hover:border-ink/30"
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-ink font-display text-lg font-bold text-paper"
                  aria-hidden
                >
                  {s.storeName.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-medium">
                    <span className="truncate">{s.storeName}</span>
                    <BadgeCheck className="size-4 shrink-0 text-teal" aria-label="Verified store" />
                  </span>
                  <span className="block text-xs text-muted-fg">{s.productCount} products</span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {s.images.slice(0, 3).map((src) => (
                  <ProductImage
                    key={src}
                    src={src}
                    alt=""
                    className="rounded-xl border border-line"
                    imgClassName="p-1.5"
                  />
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
