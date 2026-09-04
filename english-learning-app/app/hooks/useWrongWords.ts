"use client";
import { useState, useEffect } from "react";

const STORAGE_KEY = "wrong_words_v1";

export function useWrongWords() {
  const [wrongIds, setWrongIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) setWrongIds(new Set(JSON.parse(s) as number[]));
    } catch {}
  }, []);

  const save = (ids: Set<number>) => {
    setWrongIds(new Set(ids));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch {}
  };

  const addWrong   = (id: number) => { const n = new Set(wrongIds); n.add(id);    save(n); };
  const removeWrong = (id: number) => { const n = new Set(wrongIds); n.delete(id); save(n); };
  const clearWrong  = ()           => save(new Set());
  const isWrong     = (id: number) => wrongIds.has(id);

  return { wrongIds, addWrong, removeWrong, clearWrong, isWrong };
}
