"use client";
import { useState, useEffect, useCallback } from "react";

export type ReviewItemType = "word" | "phrase";

export interface ReviewItem {
  type: ReviewItemType;
  id: number;
  addedAt: number;
}

const STORAGE_KEY = "eigo-review-v1";

export function useReviewList() {
  const [items, setItems] = useState<ReviewItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (next: ReviewItem[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    setItems(next);
  };

  const add = useCallback((type: ReviewItemType, id: number) => {
    setItems((prev) => {
      if (prev.some((i) => i.type === type && i.id === id)) return prev;
      const next = [...prev, { type, id, addedAt: Date.now() }];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const remove = useCallback((type: ReviewItemType, id: number) => {
    setItems((prev) => {
      const next = prev.filter((i) => !(i.type === type && i.id === id));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const toggle = useCallback((type: ReviewItemType, id: number) => {
    setItems((prev) => {
      const exists = prev.some((i) => i.type === type && i.id === id);
      const next = exists
        ? prev.filter((i) => !(i.type === type && i.id === id))
        : [...prev, { type, id, addedAt: Date.now() }];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const isInList = useCallback(
    (type: ReviewItemType, id: number) => items.some((i) => i.type === type && i.id === id),
    [items]
  );

  return { items, add, remove, toggle, isInList, persist };
}
