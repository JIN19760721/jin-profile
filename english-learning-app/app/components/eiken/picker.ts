// 出題する問題を選ぶ処理

import { GRAMMAR_DRILLS, REORDER_DRILLS } from "../../data/eikenDrills";
import { WRITING_QUESTIONS } from "../../data/eikenWriting";
import { pickSimilar } from "../../lib/eiken/review";
import type { DrillRecord, ReviewCard, WeaknessTag, WritingAttempt, WritingQuestion } from "../../lib/eiken/types";
import type { DrillItem } from "./DrillSession";

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/** 期限が来た復習カードを問題にする（元の問題＋同じ弱点の類似問題） */
export function reviewItems(cards: ReviewCard[], max = 4): DrillItem[] {
  const items: DrillItem[] = [];
  const used: string[] = [];
  for (const card of cards) {
    if (items.length >= max) break;
    if (card.kind === "drill") {
      const g = GRAMMAR_DRILLS.find((d) => d.id === card.refId);
      const r = REORDER_DRILLS.find((d) => d.id === card.refId);
      if (g) items.push({ type: "grammar", drill: g, reviewCardId: card.id });
      else if (r) items.push({ type: "reorder", drill: r, reviewCardId: card.id });
      used.push(card.refId);
    } else if (card.id.startsWith("fix:") && card.note) {
      try {
        const n = JSON.parse(card.note) as { before: string; after: string; explain: string };
        items.push({ type: "fix", card, before: n.before, after: n.after, explain: n.explain });
      } catch { continue; }
    } else {
      continue; // 問題そのものの復習（q:）は英作文で行う
    }
    // 同じ弱点を別の文脈で確認する類似問題
    const similar = pickSimilar([...GRAMMAR_DRILLS, ...REORDER_DRILLS], card.tag, used, 1);
    for (const s of similar) {
      used.push(s.id);
      items.push("chunks" in s ? { type: "reorder", drill: s } : { type: "grammar", drill: s });
    }
  }
  return items.slice(0, max + 2);
}

/** 弱点タグを優先して基礎ドリルを選ぶ。最近解いた問題はなるべく避ける */
export function basicItems(focus: WeaknessTag[], records: DrillRecord[], grammarN: number, reorderN: number): DrillItem[] {
  const recent = new Set(records.slice(-60).map((r) => r.drillId));
  const pick = <T extends { id: string; tag: WeaknessTag }>(pool: T[], n: number): T[] => {
    const focused = shuffle(pool.filter((d) => focus.includes(d.tag) && !recent.has(d.id)));
    const fresh = shuffle(pool.filter((d) => !recent.has(d.id) && !focused.includes(d)));
    const rest = shuffle(pool.filter((d) => recent.has(d.id)));
    return [...focused, ...fresh, ...rest].slice(0, n);
  };
  return shuffle([
    ...pick(GRAMMAR_DRILLS, grammarN).map((d): DrillItem => ({ type: "grammar", drill: d })),
    ...pick(REORDER_DRILLS, reorderN).map((d): DrillItem => ({ type: "reorder", drill: d })),
  ]);
}

/** 1つの弱点タグの問題を集める（苦手克服） */
export function tagItems(tag: WeaknessTag, n = 6): DrillItem[] {
  const g = GRAMMAR_DRILLS.filter((d) => d.tag === tag).map((d): DrillItem => ({ type: "grammar", drill: d }));
  const r = REORDER_DRILLS.filter((d) => d.tag === tag).map((d): DrillItem => ({ type: "reorder", drill: d }));
  const items = shuffle([...g, ...r]).slice(0, n);
  if (items.length >= n) return items;
  // その弱点の問題が少ないときは、文法全般の問題で補う
  return [...items, ...basicItems([tag], [], n - items.length, 0)].slice(0, n);
}

/** 次に書く英作文の問題（復習期限が来た問題 → まだ書いていない問題 → 点数が低かった問題） */
export function nextQuestion(attempts: WritingAttempt[], aiQuestions: WritingQuestion[], dueQuestionIds: string[]): WritingQuestion {
  const all = [...WRITING_QUESTIONS, ...aiQuestions];
  for (const id of dueQuestionIds) {
    const q = all.find((x) => x.id === id);
    if (q) return q;
  }
  const written = new Set(attempts.map((a) => a.questionId));
  const unwritten = WRITING_QUESTIONS.filter((q) => !written.has(q.id));
  if (unwritten.length > 0) return unwritten[0];
  const byScore = [...attempts].sort((a, b) => (a.rounds.at(-1)?.result.total ?? 0) - (b.rounds.at(-1)?.result.total ?? 0));
  return all.find((q) => q.id === byScore[0]?.questionId) ?? WRITING_QUESTIONS[0];
}
