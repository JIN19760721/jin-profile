import { describe, expect, it } from "vitest";
import { WRITING_QUESTIONS } from "../../app/data/eikenWriting";
import { GRAMMAR_DRILLS, REORDER_DRILLS } from "../../app/data/eikenDrills";
import { countWords, hasNonEnglish } from "../../app/lib/eiken/text";
import { WEAKNESS_TAGS } from "../../app/lib/eiken/types";

describe("意見論述の固定問題", () => {
  it("30問あり、IDが重複しない", () => {
    expect(WRITING_QUESTIONS).toHaveLength(30);
    expect(new Set(WRITING_QUESTIONS.map((q) => q.id)).size).toBe(30);
  });

  it.each(WRITING_QUESTIONS.map((q) => [q.id, q] as const))("%s: 準2級の形式に合っている", (_id, q) => {
    expect(q.question).toMatch(/^Do you think .+\?$/);
    expect(hasNonEnglish(q.question)).toBe(false);
    const n = countWords(q.modelAnswer);
    expect(n).toBeGreaterThanOrEqual(50);
    expect(n).toBeLessThanOrEqual(60);
    expect(q.modelAnswer).toMatch(/^I (do not )?think/);
    expect(q.modelAnswer).toContain("First,");
    expect(q.modelAnswer).toContain("Second,");
    expect(q.modelAnswer).toContain("For these reasons,");
    expect(hasNonEnglish(q.modelAnswer)).toBe(false);
    expect(q.modelJp.length).toBeGreaterThan(20);
    expect(q.questionJp.length).toBeGreaterThan(5);
    expect(q.ideas.map((i) => i.side).sort()).toEqual(["no", "yes"]);
    q.ideas.forEach((i) => expect(i.reasons.length).toBeGreaterThanOrEqual(2));
  });
});

describe("基本文法ドリル", () => {
  it("50問あり、正解の番号が選択肢の範囲内", () => {
    expect(GRAMMAR_DRILLS).toHaveLength(50);
    for (const d of GRAMMAR_DRILLS) {
      expect(d.answer).toBeGreaterThanOrEqual(0);
      expect(d.answer).toBeLessThan(d.options.length);
      expect(new Set(d.options).size).toBe(d.options.length);
      expect(WEAKNESS_TAGS).toContain(d.tag);
      if (d.kind === "fill") expect(d.prompt).toContain("____");
      expect(d.explain.length).toBeGreaterThan(5);
    }
  });
});

describe("並べ替えドリル", () => {
  it("50問あり、2つ以上の語句に分かれている", () => {
    expect(REORDER_DRILLS).toHaveLength(50);
    for (const d of REORDER_DRILLS) {
      expect(d.chunks.length).toBeGreaterThanOrEqual(3);
      expect(d.chunks.every((c) => c.trim().length > 0)).toBe(true);
      expect(WEAKNESS_TAGS).toContain(d.tag);
    }
  });
});
