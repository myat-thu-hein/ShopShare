'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const CDN = 'https://cdn.dummyjson.com/product-images';

const SLIDES = [
  {
    title: 'Year-end sale',
    body: 'Up to 40% off sneakers, bags and watches. New deals every day until 31 December.',
    cta: 'Shop the sale',
    href: '/deals',
    bg: 'bg-[#1a1d3a]',
    text: 'text-white',
    button: 'bg-[#f4a300] text-[#1a1d3a]',
    images: [
      `${CDN}/mens-shoes/sports-sneakers-off-white-&-red/1.webp`,
      `${CDN}/womens-bags/blue-women's-handbag/1.webp`,
      `${CDN}/mens-watches/brown-leather-belt-watch/1.webp`,
    ],
  },
  {
    title: 'New tech with Thai warranty',
    body: 'Laptops, phones and earbuds from authorised sellers. Free delivery in 1–2 days.',
    cta: 'Browse electronics',
    href: '/c/electronics',
    bg: 'bg-[#0e7c7b]',
    text: 'text-white',
    button: 'bg-white text-[#0e4f4e]',
    images: [
      `${CDN}/laptops/apple-macbook-pro-14-inch-space-grey/1.webp`,
      `${CDN}/mobile-accessories/apple-airpods-max-silver/1.webp`,
      `${CDN}/smartphones/iphone-13-pro/1.webp`,
    ],
  },
  {
    title: 'Refresh your home',
    body: 'Sofas, lamps and condo-friendly kitchen appliances from Lanna Home & Living.',
    cta: 'Shop home & kitchen',
    href: '/c/home-kitchen',
    bg: 'bg-[#f4a300]',
    text: 'text-[#1a1d3a]',
    button: 'bg-[#1a1d3a] text-white',
    images: [
      `${CDN}/furniture/annibale-colombo-sofa/1.webp`,
      `${CDN}/home-decoration/table-lamp/1.webp`,
      `${CDN}/kitchen-accessories/boxed-blender/1.webp`,
    ],
  },
];

/** Auto-rotating promo banner. Pauses on hover/focus, and never auto-rotates with reduced motion. */
export function PromoCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);
  const go = useCallback((i: number) => setIndex((i + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  useEffect(() => {
    if (paused || reduced.current) return;
    const t = setTimeout(() => go(index + 1), 6000);
    return () => clearTimeout(t);
  }, [index, paused, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions"
      className="relative overflow-hidden rounded-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {SLIDES.map((s, i) => (
          <div
            key={s.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}: ${s.title}`}
            aria-hidden={i !== index}
            className={cn(
              'grid min-h-[260px] w-full shrink-0 grid-cols-1 items-center gap-4 p-7 sm:min-h-[320px] sm:grid-cols-[1.1fr_1fr] sm:p-10',
              s.bg,
              s.text,
            )}
          >
            <div className="max-w-md">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl">{s.title}</h2>
              <p className="mt-3 text-base opacity-85 sm:text-lg">{s.body}</p>
              <Link
                href={s.href}
                tabIndex={i === index ? 0 : -1}
                className={cn(
                  'mt-6 inline-flex h-11 items-center rounded-xl px-5 font-semibold hover:opacity-90',
                  s.button,
                )}
              >
                {s.cta}
              </Link>
            </div>
            <div className="relative hidden h-full min-h-[220px] sm:block" aria-hidden>
              {s.images.map((src, j) => (
                <div
                  key={src}
                  className={cn(
                    'absolute overflow-hidden rounded-2xl bg-white shadow-xl',
                    j === 0 && 'left-[8%] top-[6%] w-[52%] rotate-[-4deg]',
                    j === 1 && 'right-[4%] top-[2%] w-[38%] rotate-[5deg]',
                    j === 2 && 'bottom-[0%] right-[18%] w-[34%] rotate-[-2deg]',
                  )}
                >
                  <img
                    src={src}
                    alt=""
                    className="aspect-square w-full object-contain p-3"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 left-7 flex items-center gap-2 sm:left-10">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            onClick={() => go(i)}
            aria-label={`Show slide ${i + 1}: ${s.title}`}
            aria-current={i === index}
            className={cn(
              'h-2 rounded-full bg-current transition-all',
              i === index ? 'w-6 opacity-100' : 'w-2 opacity-40',
              SLIDES[index].text,
            )}
          />
        ))}
      </div>
      <div className="absolute bottom-3 right-4 flex gap-2">
        <button
          onClick={() => go(index - 1)}
          aria-label="Previous promotion"
          className="grid size-9 place-items-center rounded-full bg-white/85 text-zinc-900 shadow hover:bg-white"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={() => go(index + 1)}
          aria-label="Next promotion"
          className="grid size-9 place-items-center rounded-full bg-white/85 text-zinc-900 shadow hover:bg-white"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
}
