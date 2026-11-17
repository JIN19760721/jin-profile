import { describe, expect, it } from "vitest";
import { nextQuestion } from "../../app/components/eiken/picker";
import { WRITING_QUESTIONS } from "../../app/data/eikenWriting";
import type { WritingAttempt } from "../../app/lib/eiken/types";

const attempt = (questionId: string, total: number): WritingAttempt => ({
  id: `a-${questionId}`, questionId, questionText: "", format: "opinion", createdAt: "2026-11-01T00:00:00Z",
  reviewDue: "2026-11-02",
  rounds: [{ essay: "", gradedAt: "2026-11-01T00:00:00Z", seconds: 0, result: { total } as WritingAttempt["rounds"][number]["result"] }],
});

describe("nextQuestion", () => {
  it("まだ書いていない問題の中から毎回違う問題を選べる", () => {
    const ids = new Set(Array.from({ length: 200 }, () => nextQuestion([], [], []).id));
    expect(ids.size).toBeGreaterThan(10);
  });

  it("書いた問題は選ばない", () => {
    const attempts = WRITING_QUESTIONS.slice(1).map((q) => attempt(q.id, 10));
    for (let i = 0; i < 20; i++) expect(nextQuestion(attempts, [], []).id).toBe(WRITING_QUESTIONS[0].id);
  });

  it("復習期限の問題を優先する", () => {
    expect(nextQuestion([], [], ["op-07"], () => 0.99).id).toBe("op-07");
  });

  it("全部書いたら点数が低い問題から選ぶ", () => {
    const attempts = WRITING_QUESTIONS.map((q, i) => attempt(q.id, i < 5 ? 3 : 15));
    const low = new Set(WRITING_QUESTIONS.slice(0, 5).map((q) => q.id));
    for (let i = 0; i < 50; i++) expect(low.has(nextQuestion(attempts, [], []).id)).toBe(true);
  });
});
