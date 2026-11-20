'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import type { ReviewListDto, ReviewSummaryDto } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Stars } from '@/components/stars';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Panel, Skeleton } from '@/components/ui/misc';
import { useAuth } from '@/stores/auth';

function Summary({ productId }: { productId: string }) {
  const q = useQuery({
    queryKey: ['review-summary', productId],
    queryFn: () => api<ReviewSummaryDto>(`/products/${productId}/reviews/summary`),
  });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (!q.data || q.data.reviewCount === 0) return null;
  const s = q.data;
  return (
    <Panel className="p-5">
      <h3 className="flex items-center gap-2 text-lg">
        <Sparkles className="size-4 text-marigold" aria-hidden /> What buyers say
      </h3>
      <p className="mt-2 text-sm leading-relaxed">{s.summary}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {s.pros.length ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-teal">
              <ThumbsUp className="size-4" aria-hidden /> Pros
            </p>
            <ul className="space-y-1 text-sm">
              {s.pros.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {s.cons.length ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-chilli">
              <ThumbsDown className="size-4" aria-hidden /> Cons
            </p>
            <ul className="space-y-1 text-sm">
              {s.cons.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-xs text-muted-fg">
        {s.generatedBy === 'llm' ? 'Summarised by AI' : 'Summarised automatically'} from {s.reviewCount}{' '}
        verified reviews.
      </p>
    </Panel>
  );
}

function ReviewForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api(`/products/${productId}/reviews`, {
        method: 'POST',
        body: { rating, title: title || undefined, comment },
      }),
    onSuccess: () => {
      toast.success('Review posted. Thank you!');
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form
      className="space-y-3 rounded-2xl border border-line p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rating) return toast.error('Choose a star rating');
        m.mutate();
      }}
    >
      <h3 className="text-lg">Write a review</h3>
      <fieldset>
        <legend className="mb-1 text-sm">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              aria-label={`${i} star${i > 1 ? 's' : ''}`}
              aria-pressed={rating === i}
            >
              <Star className={cn('size-7', i <= rating ? 'fill-marigold text-marigold' : 'text-line')} />
            </button>
          ))}
        </div>
      </fieldset>
      <Input
        aria-label="Review title (optional)"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
      />
      <Textarea
        aria-label="Your review"
        placeholder="What did you like or dislike?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        required
        minLength={5}
        maxLength={2000}
      />
      <Button type="submit" disabled={m.isPending}>
        {m.isPending ? 'Posting…' : 'Post review'}
      </Button>
    </form>
  );
}

export function Reviews({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const status = useAuth((s) => s.status);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['reviews', productId, page, status],
    queryFn: () => api<ReviewListDto>(`/products/${productId}/reviews?page=${page}`),
    enabled: status !== 'loading',
    placeholderData: (prev) => prev,
  });
  const data = q.data;

  return (
    <section id="reviews" className="mt-20 scroll-mt-32" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="text-2xl">
        Reviews
      </h2>
      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          {data ? (
            <div>
              <p className="price text-5xl">{data.ratingCount ? data.ratingAvg.toFixed(1) : '–'}</p>
              <Stars value={data.ratingAvg} className="mt-1" size="md" />
              <p className="mt-1 text-sm text-muted-fg">{data.ratingCount} verified reviews</p>
              <div className="mt-4 space-y-1.5">
                {([5, 4, 3, 2, 1] as const).map((r) => {
                  const n = data.distribution[r];
                  const pct = data.ratingCount ? (n / data.ratingCount) * 100 : 0;
                  return (
                    <div key={r} className="flex items-center gap-2 text-xs">
                      <span className="w-6">{r}★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-marigold"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-6 text-right text-muted-fg">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <Skeleton className="h-44" />
          )}
          <Summary productId={productId} />
        </div>

        <div className="space-y-6">
          {data?.canReview ? (
            <ReviewForm
              productId={productId}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['reviews', productId] });
                qc.invalidateQueries({ queryKey: ['review-summary', productId] });
              }}
            />
          ) : status === 'authenticated' ? (
            <p className="text-sm text-muted-fg">Only buyers who purchased this product can review it.</p>
          ) : null}
          {data && data.items.length === 0 ? (
            <p className="text-muted-fg">No reviews yet. Buyers can review after their order is paid.</p>
          ) : null}
          <ul className="divide-y divide-line">
            {data?.items.map((r) => (
              <li key={r.id} className="py-5">
                <div className="flex items-center gap-3">
                  <Stars value={r.rating} />
                  {r.title ? <span className="font-medium">{r.title}</span> : null}
                </div>
                <p className="mt-2 max-w-[70ch] text-sm leading-relaxed">{r.comment}</p>
                <p className="mt-2 text-xs text-muted-fg">
                  {r.user.name}, {formatDate(r.createdAt)}. Verified purchase.
                </p>
              </li>
            ))}
          </ul>
          {data && data.totalPages > 1 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Newer
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Older
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
