'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  productInputSchema,
  type CategoryDto,
  type GeneratedDescription,
  type ProductDetailDto,
  type ProductStatus,
} from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { imageUrl } from '@/lib/utils';
import { Button } from './ui/button';
import { Input, Select, Textarea } from './ui/input';
import { Field } from './ui/label';
import { Panel } from './ui/misc';

interface VariantRow {
  id?: string;
  colour: string;
  size: string;
  sku: string;
  stock: string;
  price: string;
}

const toRow = (v: ProductDetailDto['variants'][number]): VariantRow => ({
  id: v.id,
  colour: v.colour ?? '',
  size: v.size ?? '',
  sku: v.sku ?? '',
  stock: String(v.stock),
  price: v.price != null ? String(v.price / 100) : '',
});

/** Create/edit form for sellers. Prices are typed in baht and sent to the API in satang. */
export function ProductForm({ product }: { product?: ProductDetailDto }) {
  const router = useRouter();
  const qc = useQueryClient();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryDto[]>('/categories') });

  const [title, setTitle] = useState(product?.title ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState(product ? String(product.price / 100) : '');
  const [stock, setStock] = useState(product ? String(product.stock) : '10');
  const [description, setDescription] = useState(product?.description ?? '');
  const [keywords, setKeywords] = useState('');
  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [images, setImages] = useState<{ url: string; alt?: string }[]>(
    product?.images.map((i) => ({ url: i.url, alt: i.alt ?? undefined })) ?? [],
  );
  const [variants, setVariants] = useState<VariantRow[]>(product?.variants.map(toRow) ?? []);
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'DRAFT');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  // Category comes back as a slug on the product; map it to an id once categories load.
  const effectiveCategory =
    categoryId || categories.data?.find((c) => c.slug === product?.category?.slug)?.id || '';

  const generate = useMutation({
    mutationFn: () =>
      api<GeneratedDescription & { generatedBy: 'llm' | 'rules' }>('/seller/ai/description', {
        method: 'POST',
        body: {
          title,
          keywords: keywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          imageUrl: images[0]?.url && !images[0].url.endsWith('.svg') ? images[0].url : undefined,
          categoryName: categories.data?.find((c) => c.id === effectiveCategory)?.name,
        },
      }),
    onSuccess: (r) => {
      setDescription(r.description);
      setTags((t) => [...new Set([...t, ...r.tags])].slice(0, 15));
      toast.success(
        r.generatedBy === 'llm'
          ? 'Description written by AI — review it before publishing'
          : 'Draft created from your keywords — add your own details',
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: (body: unknown) =>
      product
        ? api<ProductDetailDto>(`/products/${product.id}`, { method: 'PATCH', body })
        : api<ProductDetailDto>('/products', { method: 'POST', body }),
    onSuccess: (p) => {
      toast.success(
        product ? 'Product saved' : p.status === 'PUBLISHED' ? 'Product published' : 'Draft saved',
      );
      qc.invalidateQueries({ queryKey: ['seller'] });
      router.push('/seller/products');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 8 - images.length)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 5 MB`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        const { url } = await api<{ url: string }>('/uploads/images', { method: 'POST', body: fd });
        setImages((imgs) => [...imgs, { url, alt: title }]);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 15) setTags([...tags, t]);
    setTagInput('');
  }

  function submit(nextStatus: ProductStatus) {
    const body = {
      title,
      description,
      price: Math.round(Number(price) * 100),
      stock: Number(stock) || 0,
      categoryId: effectiveCategory,
      status: nextStatus,
      tags,
      images,
      variants: variants
        .filter((v) => v.colour || v.size || v.sku)
        .map((v) => ({
          id: v.id,
          colour: v.colour || null,
          size: v.size || null,
          sku: v.sku || null,
          stock: Number(v.stock) || 0,
          price: v.price ? Math.round(Number(v.price) * 100) : null,
        })),
    };
    const parsed = productInputSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      toast.error('Please fix the highlighted fields');
      return;
    }
    setErrors({});
    setStatus(nextStatus);
    save.mutate(body);
  }

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1fr_320px]"
      onSubmit={(e) => {
        e.preventDefault();
        submit(status);
      }}
      noValidate
    >
      <div className="space-y-6">
        <Panel className="space-y-4 p-5">
          <Field label="Title" htmlFor="title" error={errors.title}>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              aria-invalid={!!errors.title}
              placeholder="e.g. StrideMax Wide Running Shoe"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category" htmlFor="category" error={errors.categoryId}>
              <Select
                id="category"
                className="w-full"
                value={effectiveCategory}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-invalid={!!errors.categoryId}
              >
                <option value="">Choose…</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Price (฿)" htmlFor="price" error={errors.price}>
              <Input
                id="price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
                aria-invalid={!!errors.price}
                placeholder="1890"
              />
            </Field>
            <Field label="Stock" htmlFor="stock" hint={variants.length ? 'Set per option below' : undefined}>
              <Input
                id="stock"
                inputMode="numeric"
                value={variants.length ? '' : stock}
                disabled={variants.length > 0}
                onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
        </Panel>

        <Panel className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Field
                label="Keywords for the AI"
                htmlFor="keywords"
                hint="Comma separated, e.g. wide fit, breathable, cushioned"
              >
                <Input id="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={title.trim().length < 3 || generate.isPending}
              onClick={() => generate.mutate()}
              className="mb-6"
            >
              {generate.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Sparkles className="text-marigold" />
              )}
              {generate.isPending ? 'Writing…' : 'Generate description'}
            </Button>
          </div>
          <Field label="Description" htmlFor="description" error={errors.description}>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-56"
              maxLength={5000}
              aria-invalid={!!errors.description}
            />
          </Field>
          <Field label="Tags" htmlFor="tags" hint="Press Enter to add. Tags help search.">
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    aria-label={`Remove tag ${t}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                onBlur={() => tagInput && addTag(tagInput)}
                className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
                placeholder={tags.length ? '' : 'running, wide fit…'}
              />
            </div>
          </Field>
        </Panel>

        <Panel className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg">Options</h2>
              <p className="text-sm text-muted-fg">Sizes and colours, each with its own stock.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setVariants([...variants, { colour: '', size: '', sku: '', stock: '0', price: '' }])
              }
            >
              <Plus /> Add option
            </Button>
          </div>
          {variants.length ? (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_1fr_1fr_80px_100px_40px] gap-2 text-xs text-muted-fg sm:grid">
                <span>Colour</span>
                <span>Size</span>
                <span>SKU</span>
                <span>Stock</span>
                <span>Price (฿, optional)</span>
                <span />
              </div>
              {variants.map((v, i) => {
                const update = (k: keyof VariantRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
                  setVariants(variants.map((row, j) => (j === i ? { ...row, [k]: e.target.value } : row)));
                return (
                  <div
                    key={v.id ?? i}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_80px_100px_40px]"
                  >
                    <Input
                      aria-label="Colour"
                      placeholder="red"
                      value={v.colour}
                      onChange={update('colour')}
                    />
                    <Input aria-label="Size" placeholder="42" value={v.size} onChange={update('size')} />
                    <Input aria-label="SKU" placeholder="SKU" value={v.sku} onChange={update('sku')} />
                    <Input
                      aria-label="Stock"
                      inputMode="numeric"
                      value={v.stock}
                      onChange={update('stock')}
                    />
                    <Input
                      aria-label="Price override"
                      inputMode="decimal"
                      value={v.price}
                      onChange={update('price')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove option"
                      onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel className="space-y-3 p-5">
          <h2 className="text-lg">Photos</h2>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <div key={img.url} className="group relative">
                <img
                  src={imageUrl(img.url, 400)}
                  alt={img.alt ?? ''}
                  className="aspect-square w-full rounded-xl border border-line bg-white object-contain p-1"
                />
                {i === 0 ? (
                  <span className="absolute bottom-1 left-1 rounded bg-ink px-1.5 text-[10px] text-paper">
                    Main
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-surface p-1 shadow"
                  aria-label="Remove photo"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {images.length < 8 ? (
              <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-line text-muted-fg hover:bg-muted">
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                <span className="sr-only">Upload photos</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(e) => upload(e.target.files)}
                  disabled={uploading}
                />
              </label>
            ) : null}
          </div>
          <p className="text-xs text-muted-fg">
            JPEG, PNG or WebP up to 5 MB. Photos are resized automatically.
          </p>
        </Panel>

        <Panel className="space-y-3 p-5">
          <h2 className="text-lg">Visibility</h2>
          <p className="text-sm text-muted-fg">
            {status === 'PUBLISHED' ? 'Visible to buyers.' : 'Draft — only you can see it.'}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="accent"
              disabled={save.isPending}
              onClick={() => submit('PUBLISHED')}
            >
              {product?.status === 'PUBLISHED' ? 'Save and keep published' : 'Publish'}
            </Button>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit('DRAFT')}>
              {product?.status === 'PUBLISHED' ? 'Unpublish (save as draft)' : 'Save draft'}
            </Button>
          </div>
        </Panel>
      </div>
    </form>
  );
}
