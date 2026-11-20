'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageCircle, SendHorizontal, Sparkles, X } from 'lucide-react';
import type { AssistantProductRef, AssistantResponseDto } from '@shopsense/shared';
import { api, errorMessage } from '@/lib/api';
import { cn, formatTHB, imageUrl } from '@/lib/utils';
import { useAssistant } from '@/stores/assistant';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  products?: AssistantProductRef[];
  error?: boolean;
}

const SUGGESTIONS = [
  'Running shoes under 2,500 baht',
  'Gifts under 1,000 baht',
  'Compare the MacBook Pro and Dell XPS 13',
  'Is the Rolex Submariner waterproof?',
];

/** Renders the assistant's reply: product links, bullets and line breaks. Never raw HTML. */
export function AssistantText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, li) => {
        const parts: React.ReactNode[] = [];
        const re = /\[([^\]]+)\]\((\/p\/[a-z0-9฀-๿-]+)\)|\*\*([^*]+)\*\*/gi;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) {
          if (m.index > last) parts.push(line.slice(last, m.index));
          if (m[1]) {
            parts.push(
              <Link key={m.index} href={m[2]} className="font-medium text-teal underline underline-offset-2">
                {m[1]}
              </Link>,
            );
          } else parts.push(<strong key={m.index}>{m[3]}</strong>);
          last = m.index + m[0].length;
        }
        parts.push(line.slice(last));
        return (
          <Fragment key={li}>
            {li > 0 ? <br /> : null}
            {parts}
          </Fragment>
        );
      })}
    </>
  );
}

export function AssistantWidget() {
  const { open, setOpen, pinned, unpin, consumeDraft, draft } = useAssistant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chat = useMutation({
    mutationFn: (history: Message[]) =>
      api<AssistantResponseDto>('/assistant/chat', {
        method: 'POST',
        body: {
          messages: history
            .filter((m) => !m.error)
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content })),
          productIds: pinned.map((p) => p.id),
        },
      }),
    onSuccess: (res) =>
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, products: res.products }]),
    onError: (e) => setMessages((m) => [...m, { role: 'assistant', content: errorMessage(e), error: true }]),
  });

  function send(text: string) {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    chat.mutate(next);
  }

  // A product page can open the assistant with a ready-made question.
  useEffect(() => {
    if (open && draft) send(consumeDraft());
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, chat.isPending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // A shopping assistant has no job in the seller/admin dashboards (and would cover their buttons).
  if (pathname.startsWith('/seller') || pathname.startsWith('/admin')) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        className={cn(
          'fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-4 sm:px-5 font-medium text-paper shadow-lg hover:bg-ink/90',
          open && 'hidden sm:inline-flex',
        )}
      >
        {open ? <X className="size-4" /> : <MessageCircle className="size-4" />}
        <span className="sr-only sm:not-sr-only">{open ? 'Close' : 'Ask ShopShare'}</span>
      </button>

      {open ? (
        <section
          id="assistant-panel"
          role="dialog"
          aria-label="Shopping assistant"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col border-line bg-surface shadow-2xl sm:inset-x-auto sm:bottom-20 sm:right-5 sm:h-[600px] sm:w-[400px] sm:rounded-2xl sm:border"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-marigold" aria-hidden /> Shopping assistant
              </h2>
              <p className="text-xs text-muted-fg">Answers only from real ShopShare listings</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 hover:bg-muted"
              aria-label="Close assistant"
            >
              <X className="size-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-fg">
                  Ask about a product, get suggestions, or compare two items.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-line px-3 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-ink text-paper'
                      : m.error
                        ? 'bg-chilli/10 text-chilli'
                        : 'bg-muted',
                  )}
                >
                  {m.role === 'assistant' ? <AssistantText text={m.content} /> : m.content}
                </div>
                {m.products?.length ? (
                  <div className="flex w-full gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {m.products.map((p) => (
                      <Link
                        key={p.id}
                        href={`/p/${p.slug}`}
                        className="flex w-40 shrink-0 items-center gap-2 rounded-xl border border-line p-2 hover:bg-muted"
                      >
                        <img
                          src={imageUrl(p.imageUrl, 400)}
                          alt=""
                          className="size-10 rounded-lg border border-line bg-white object-contain p-1"
                        />
                        <span className="min-w-0">
                          <span className="line-clamp-1 text-xs font-medium">{p.title}</span>
                          <span className="price text-xs">{formatTHB(p.price)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {chat.isPending ? (
              <div className="flex gap-1 px-1" aria-label="Assistant is typing">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-2 animate-bounce rounded-full bg-muted-fg motion-reduce:animate-none"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <footer className="border-t border-line p-3">
            {pinned.length ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pinned.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-marigold-soft px-2.5 py-1 text-xs"
                  >
                    About: {p.title}
                    <button
                      onClick={() => unpin(p.id)}
                      aria-label={`Stop asking about ${p.title}`}
                      className="rounded-full hover:bg-black/10"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <label htmlFor="assistant-input" className="sr-only">
                Message
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Is this watch waterproof?"
                className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={!input.trim() || chat.isPending}
                className="grid size-10 place-items-center rounded-xl bg-marigold text-marigold-fg disabled:opacity-40"
                aria-label="Send"
              >
                <SendHorizontal className="size-4" />
              </button>
            </form>
          </footer>
        </section>
      ) : null}
    </>
  );
}
