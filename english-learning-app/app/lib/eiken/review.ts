// 復習カードの間隔反復（翌日 → 3日後 → 7日後 → 14日後）

import type { ReviewCard, WeaknessTag } from "./types";
import { addDays } from "./text";

export const REVIEW_INTERVALS = [1, 3, 7, 14];

/** 間違えたときに作る（すでにあれば最初の段階に戻す） */
export function addOrResetCard(
  cards: ReviewCard[],
  card: Omit<ReviewCard, "stage" | "due">,
  today: string,
): ReviewCard[] {
  const next: ReviewCard = { ...card, stage: 0, due: addDays(today, REVIEW_INTERVALS[0]) };
  const i = cards.findIndex((c) => c.id === card.id);
  if (i < 0) return [...cards, next];
  const copy = [...cards];
  copy[i] = { ...copy[i], ...next, note: card.note ?? copy[i].note };
  return copy;
}

/**
 * 復習の結果を反映する。
 * 正解なら次の間隔へ（14日後の復習に正解したら卒業してカードを消す）。
 * 不正解なら翌日からやり直し。
 */
export function applyReview(cards: ReviewCard[], id: string, correct: boolean, today: string): ReviewCard[] {
  const i = cards.findIndex((c) => c.id === id);
  if (i < 0) return cards;
  const card = cards[i];
  if (correct) {
    const stage = card.stage + 1;
    if (stage >= REVIEW_INTERVALS.length) return cards.filter((c) => c.id !== id);
    const copy = [...cards];
    copy[i] = { ...card, stage, due: addDays(today, REVIEW_INTERVALS[stage]) };
    return copy;
  }
  const copy = [...cards];
  copy[i] = { ...card, stage: 0, due: addDays(today, REVIEW_INTERVALS[0]) };
  return copy;
}

/** 今日やるべき復習（期限切れが古い順） */
export function dueCards(cards: ReviewCard[], today: string, limit = 5): ReviewCard[] {
  return cards
    .filter((c) => c.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.stage - b.stage)
    .slice(0, limit);
}

/** 同じ弱点タグの別の問題を選ぶ（類似問題） */
export function pickSimilar<T extends { id: string; tag: WeaknessTag }>(
  pool: T[], tag: WeaknessTag, excludeIds: string[], n: number, rand: () => number = Math.random,
): T[] {
  const same = pool.filter((p) => p.tag === tag && !excludeIds.includes(p.id));
  return [...same].sort(() => rand() - 0.5).slice(0, n);
}
