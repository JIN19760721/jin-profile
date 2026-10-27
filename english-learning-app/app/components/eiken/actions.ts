"use client";
// 学習データを更新する操作（画面から呼ぶ）

import { eikenStore } from "../../hooks/useEikenStore";
import { addOrResetCard, applyReview } from "../../lib/eiken/review";
import { addDays, localDate } from "../../lib/eiken/text";
import { WRITING_QUESTIONS } from "../../data/eikenWriting";
import { GRAMMAR_DRILLS, REORDER_DRILLS } from "../../data/eikenDrills";
import type {
  GradeResult, GrammarDrill, ReorderDrill, WritingAttempt, WritingQuestion,
} from "../../lib/eiken/types";

let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function findQuestion(id: string): WritingQuestion | undefined {
  return WRITING_QUESTIONS.find((q) => q.id === id) ?? eikenStore.get().data.aiQuestions.find((q) => q.id === id);
}

export function findDrill(id: string): GrammarDrill | ReorderDrill | undefined {
  return GRAMMAR_DRILLS.find((d) => d.id === id) ?? REORDER_DRILLS.find((d) => d.id === id);
}

/** 文法・並べ替えの解答を記録する。間違えたら復習カードを作り、復習中なら間隔を進める */
export function recordDrill(drill: GrammarDrill | ReorderDrill, correct: boolean, reviewCardId?: string) {
  const today = localDate();
  const kind = "chunks" in drill ? "reorder" : "grammar";
  eikenStore.updateData((d) => {
    let reviews = d.reviews;
    if (reviewCardId) reviews = applyReview(reviews, reviewCardId, correct, today);
    if (!correct && !reviewCardId) {
      reviews = addOrResetCard(reviews, { id: `drill:${drill.id}`, kind: "drill", refId: drill.id, tag: drill.tag }, today);
    }
    return { ...d, reviews, drills: [...d.drills, { drillId: drill.id, kind, tag: drill.tag, correct, at: new Date().toISOString() }] };
  });
}

/** 英作文の添削から作った復習カードの結果を記録する */
export function recordWritingReview(cardId: string, correct: boolean) {
  const today = localDate();
  eikenStore.updateData((d) => ({ ...d, reviews: applyReview(d.reviews, cardId, correct, today) }));
}

/**
 * 採点結果を保存する。attemptId を渡すと書き直しとして同じ解答に追加する。
 * 文法添削の項目は復習カードにする。
 */
export function saveGradedAttempt(args: {
  question: WritingQuestion; essay: string; result: GradeResult; seconds: number; attemptId?: string; cacheKey: string;
}): string {
  const { question, essay, result, seconds, attemptId, cacheKey } = args;
  const today = localDate();
  const now = new Date().toISOString();
  const id = attemptId ?? newId("wa");
  eikenStore.updateData((d) => {
    let attempts: WritingAttempt[];
    const round = { essay, result, gradedAt: now, seconds };
    const existing = d.attempts.find((a) => a.id === id);
    if (existing) {
      attempts = d.attempts.map((a) => (a.id === id ? { ...a, rounds: [...a.rounds, round] } : a));
    } else {
      attempts = [...d.attempts, {
        id, questionId: question.id, questionText: question.question, format: "opinion",
        createdAt: now, rounds: [round], reviewDue: addDays(today, 1),
      }];
    }
    let reviews = d.reviews;
    for (const c of result.corrections.slice(0, 4)) {
      reviews = addOrResetCard(reviews, {
        id: `fix:${c.before.toLowerCase().replace(/\s+/g, " ").slice(0, 80)}`,
        kind: "writing", refId: id, tag: c.tag, note: JSON.stringify({ before: c.before, after: c.after, explain: c.explain }),
      }, today);
    }
    // 総合点が低い問題は、問題そのものも復習対象にする（復習中の問題で9点以上なら次の間隔へ）
    const qCard = `q:${question.id}`;
    if (!existing && result.total <= 8) {
      reviews = addOrResetCard(reviews, { id: qCard, kind: "writing", refId: question.id, tag: "content" }, today);
    } else if (!existing && reviews.some((r) => r.id === qCard && r.due <= today)) {
      reviews = applyReview(reviews, qCard, true, today);
    }
    const aiQuestions = question.source === "ai" && !d.aiQuestions.some((q) => q.id === question.id)
      ? [...d.aiQuestions, question] : d.aiQuestions;
    return { ...d, attempts, reviews, aiQuestions, gradeCache: { ...d.gradeCache, [cacheKey]: result } };
  });
  eikenStore.addStudySeconds(seconds);
  return id;
}

export function addAiQuestion(q: WritingQuestion) {
  eikenStore.updateData((d) => (d.aiQuestions.some((x) => x.id === q.id) ? d : { ...d, aiQuestions: [...d.aiQuestions, q].slice(-100) }));
}
