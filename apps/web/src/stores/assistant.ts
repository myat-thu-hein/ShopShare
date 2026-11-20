'use client';

import { create } from 'zustand';

export interface PinnedProduct {
  id: string;
  title: string;
  slug: string;
}

interface AssistantState {
  open: boolean;
  /** Products the assistant should focus on (current page, compare list). Max 2. */
  pinned: PinnedProduct[];
  draft: string;
  setOpen: (open: boolean) => void;
  pin: (p: PinnedProduct) => void;
  unpin: (id: string) => void;
  ask: (question: string, product?: PinnedProduct) => void;
  consumeDraft: () => string;
}

export const useAssistant = create<AssistantState>((set, get) => ({
  open: false,
  pinned: [],
  draft: '',
  setOpen: (open) => set({ open }),
  pin: (p) => set((s) => (s.pinned.some((x) => x.id === p.id) ? s : { pinned: [...s.pinned.slice(-1), p] })),
  unpin: (id) => set((s) => ({ pinned: s.pinned.filter((p) => p.id !== id) })),
  ask: (question, product) => {
    if (product) get().pin(product);
    set({ open: true, draft: question });
  },
  consumeDraft: () => {
    const d = get().draft;
    set({ draft: '' });
    return d;
  },
}));
