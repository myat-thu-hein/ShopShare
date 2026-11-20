import Link from 'next/link';
import type { CategoryDto } from '@shopsense/shared';
import { ProductImage } from '../product-image';

export function CategoryTiles({ categories }: { categories: CategoryDto[] }) {
  return (
    <section aria-labelledby="shop-by-category" className="mt-10">
      <h2 id="shop-by-category" className="mb-4 text-2xl">
        Shop by category
      </h2>
      <ul className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-8">
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={`/c/${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
              <ProductImage
                src={c.imageUrl}
                alt=""
                className="size-16 rounded-full border border-line sm:size-24"
                imgClassName="p-2 transition-transform group-hover:scale-110 motion-reduce:transition-none"
              />
              <span className="text-xs font-medium leading-tight sm:text-sm">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
