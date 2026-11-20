'use client';

import { useMemo, useState } from 'react';
import { Heart, Minus, Plus, Sparkles, Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import type { ProductDetailDto, ProductVariantDto } from '@shopsense/shared';
import { cn, formatTHB } from '@/lib/utils';
import { Price } from '@/components/price';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/use-cart';
import { useWishlist } from '@/hooks/use-wishlist';
import { useAssistant } from '@/stores/assistant';

/** "Mon 24 Nov – Wed 26 Nov": 2 to 4 days from today. */
function deliveryWindow() {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const day = 86_400_000;
  return `${fmt(new Date(Date.now() + 2 * day))} – ${fmt(new Date(Date.now() + 4 * day))}`;
}

export function Purchase({ product }: { product: ProductDetailDto }) {
  const cart = useCart();
  const wishlist = useWishlist();
  const assistant = useAssistant();
  const variants = product.variants;
  const colours = useMemo(
    () => [...new Set(variants.map((v) => v.colour).filter((c): c is string => !!c))],
    [variants],
  );
  const sizes = useMemo(
    () => [...new Set(variants.map((v) => v.size).filter((s): s is string => !!s))],
    [variants],
  );

  const [colour, setColour] = useState<string | null>(
    colours.length === 1
      ? colours[0]
      : (colours.find((c) => variants.some((v) => v.colour === c && v.stock > 0)) ?? null),
  );
  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0] : null);
  const [qty, setQty] = useState(1);

  const variant: ProductVariantDto | undefined = variants.length
    ? variants.find(
        (v) => (colours.length ? v.colour === colour : true) && (sizes.length ? v.size === size : true),
      )
    : undefined;
  const needsChoice = variants.length > 0 && !variant;
  const available = variants.length ? (variant?.stock ?? 0) : product.stock;
  const price = variant?.price ?? product.price;
  const saved = wishlist.has(product.id);
  const pin = { id: product.id, title: product.title, slug: product.slug };

  const sizeStock = (s: string) =>
    variants.find((v) => v.size === s && (colours.length ? v.colour === colour : true))?.stock ?? 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl bg-muted/60 p-4">
        <Price
          price={price}
          compareAtPrice={
            product.compareAtPrice && product.compareAtPrice > price ? product.compareAtPrice : null
          }
          size="lg"
        />
        {product.compareAtPrice && product.compareAtPrice > price ? (
          <p className="mt-1 text-sm font-medium text-chilli">
            You save {formatTHB(product.compareAtPrice - price)}
          </p>
        ) : null}
      </div>

      {colours.length ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Colour: <span className="capitalize text-muted-fg">{colour ?? 'choose one'}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {colours.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={colour === c}
                onClick={() => {
                  setColour(c);
                  setQty(1);
                }}
                className={cn(
                  'rounded-xl border px-3.5 py-2 text-sm capitalize',
                  colour === c ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink/40',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {sizes.length ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Size: <span className="text-muted-fg">{size ?? 'choose one'}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const out = sizeStock(s) === 0;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={out}
                  aria-pressed={size === s}
                  onClick={() => {
                    setSize(s);
                    setQty(1);
                  }}
                  className={cn(
                    'min-w-12 rounded-xl border px-3 py-2 text-sm',
                    size === s ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink/40',
                    out && 'cursor-not-allowed line-through opacity-40',
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <p
        className={cn(
          'text-sm',
          available > 0 && available <= 5 ? 'font-medium text-chilli' : 'text-muted-fg',
        )}
        aria-live="polite"
      >
        {needsChoice
          ? 'Choose your options to see stock'
          : available === 0
            ? 'Out of stock'
            : available <= 5
              ? `Only ${available} left`
              : 'In stock'}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex h-12 items-center rounded-xl border border-line"
          role="group"
          aria-label="Quantity"
        >
          <button
            type="button"
            className="grid size-12 place-items-center disabled:opacity-30"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center tabular-nums" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            className="grid size-12 place-items-center disabled:opacity-30"
            onClick={() => setQty((q) => Math.min(available, q + 1))}
            disabled={qty >= available}
            aria-label="Increase quantity"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <Button
          size="lg"
          variant="accent"
          className="flex-1"
          disabled={needsChoice || available === 0 || cart.adding}
          onClick={() =>
            cart.add({
              productId: product.id,
              variantId: variant?.id ?? null,
              quantity: qty,
              title: product.title,
              slug: product.slug,
              unitPrice: price,
              imageUrl: product.imageUrl,
              variantLabel: variant
                ? [variant.colour, variant.size ? `Size ${variant.size}` : null].filter(Boolean).join(' / ')
                : null,
              available,
            })
          }
        >
          {needsChoice
            ? 'Choose options'
            : available === 0
              ? 'Sold out'
              : cart.adding
                ? 'Adding…'
                : 'Add to cart'}
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-12"
          onClick={() => wishlist.toggle(product.id)}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
        >
          <Heart className={cn(saved && 'fill-chilli text-chilli')} />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => assistant.ask(`Tell me the key facts about the ${product.title}.`, pin)}
        >
          <Sparkles className="text-marigold" /> Ask about this product
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            assistant.pin(pin);
            assistant.setOpen(true);
          }}
        >
          Add to compare
        </Button>
      </div>

      <ul className="space-y-2 rounded-2xl border border-line p-4 text-sm">
        <li className="flex items-start gap-2">
          <Truck className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
          <span>
            <span className="font-medium">Free delivery</span>{' '}
            <span className="text-muted-fg">by {deliveryWindow()}</span>
          </span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
          <span>
            <span className="font-medium">Secure checkout</span>{' '}
            <span className="text-muted-fg">with Stripe. Your card details never touch our servers.</span>
          </span>
        </li>
        <li className="flex items-start gap-2">
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
          <span>
            <span className="font-medium">7-day returns</span>{' '}
            <span className="text-muted-fg">if it isn’t right.</span>
          </span>
        </li>
      </ul>
    </div>
  );
}
