import { describe, expect, it } from "vitest";
import { analyze, MIN_ESSAYS } from "../../app/lib/eiken/analysis";
import { buildDailyPlan, currentStage } from "../../app/lib/eiken/curriculum";
import { parseGradeResult } from "../../app/lib/eiken/grade";
import { validateGeneratedQuestion } from "../../app/lib/eiken/generate";
import { addOrResetCard, applyReview, dueCards, REVIEW_INTERVALS } from "../../app/lib/eiken/review";
import { daysThisWeek, streak } from "../../app/lib/eiken/stats";
import { addDays, countWords, daysBetween, hasNonEnglish, wordCountStatus } from "../../app/lib/eiken/text";
import type { DrillRecord, EikenProfile, GradeResult, WritingAttempt } from "../../app/lib/eiken/types";
import { WRITING_QUESTIONS } from "../../app/data/eikenWriting";

const profile: EikenProfile = {
  grade: "高校1年生", targetExam: "英検準2級", examDate: "2027-01-24", dailyMinutes: 15,
  cse: { reading: 445, listening: 411, writing: 288 }, passLine: 1322, showTemplate: "auto", writingDetails: [],
};

const validRaw = {
  scores: { content: 3, organization: 3, vocabulary: 2, grammar: 4 },
  goodPoints: "意見と理由がはっきりしています。",
  improvements: ["理由に例を加えましょう。", "語彙を増やしましょう。", "まとめを書きましょう。", "4つ目は捨てられる"],
  corrections: [{ before: "I am agree with this idea.", after: "I agree with this idea.", explain: "agree は動詞なので am は不要です。", tag: "agreement" }],
  correctedEssay: "I agree with this idea.",
  modelAnswer: "I think so.",
  weaknessTags: ["agreement", "not-a-tag"],
};

function result(total: [number, number, number, number], tags: GradeResult["weaknessTags"] = []): GradeResult {
  const [content, organization, vocabulary, grammar] = total;
  return {
    scores: { content, organization, vocabulary, grammar }, total: content + organization + vocabulary + grammar,
    goodPoints: "", improvements: [], corrections: [], correctedEssay: "", modelAnswer: "", weaknessTags: tags, wordCount: 55,
  };
}

function attempt(i: number, s: [number, number, number, number], tags: GradeResult["weaknessTags"] = [], seconds = 600): WritingAttempt {
  const at = new Date(2026, 9, 1 + i).toISOString();
  return { id: `a${i}`, questionId: "op-01", questionText: "", format: "opinion", createdAt: at,
           rounds: [{ essay: "", result: result(s, tags), gradedAt: at, seconds }] };
}

const drills = (n: number, correct: boolean, tag: DrillRecord["tag"] = "grammar"): DrillRecord[] =>
  Array.from({ length: n }, (_, i) => ({ drillId: `gr-${i}`, kind: "grammar", tag, correct, at: new Date(2026, 9, 1, 0, i).toISOString() }));

describe("語数カウント", () => {
  it("空白で区切って数え、記号だけの塊は数えない", () => {
    expect(countWords("I think so. First, it's fun!")).toBe(6);
    expect(countWords("  ")).toBe(0);
    expect(countWords("Hello - world")).toBe(2);
  });
  it("50〜60語の判定", () => {
    expect(wordCountStatus(49)).toBe("short");
    expect(wordCountStatus(50)).toBe("ok");
    expect(wordCountStatus(61)).toBe("long");
  });
  it("日本語・全角を見つける", () => {
    expect(hasNonEnglish("I think so.")).toBe(false);
    expect(hasNonEnglish("I think そう.")).toBe(true);
    expect(hasNonEnglish("I’m happy.")).toBe(false);
  });
  it("日付の計算", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-27", "2027-01-24")).toBe(89);
  });
});

describe("AI添削結果の検証", () => {
  it("正しい応答を受け付け、合計点を計算し直す", () => {
    const r = parseGradeResult(validRaw, "I am agree with this idea. ".repeat(10));
    expect(r).not.toBeNull();
    expect(r!.total).toBe(12);
    expect(r!.improvements).toHaveLength(3);
    expect(r!.weaknessTags).toEqual(["agreement"]);
    expect(r!.corrections[0].after).toBe("I agree with this idea.");
  });
  it("点数が範囲外・欠けているものは拒否する", () => {
    expect(parseGradeResult({ ...validRaw, scores: { ...validRaw.scores, content: 5 } }, "x")).toBeNull();
    expect(parseGradeResult({ ...validRaw, scores: { content: 3 } }, "x")).toBeNull();
    expect(parseGradeResult({ ...validRaw, goodPoints: "" }, "x")).toBeNull();
    expect(parseGradeResult("not json", "x")).toBeNull();
    expect(parseGradeResult(null, "x")).toBeNull();
  });
  it("語数が極端に少ないときは語数不足のタグを付ける", () => {
    const r = parseGradeResult(validRaw, "I agree.");
    expect(r!.weaknessTags).toContain("word_count");
  });
});

describe("AI生成問題の検証", () => {
  const base = WRITING_QUESTIONS[0];
  const raw = { ...base };
  it("固定問題と同じ形式なら受け付ける", () => {
    const c = validateGeneratedQuestion(raw, "ai-1", "grammar");
    expect(c.problems).toEqual([]);
    expect(c.question?.source).toBe("ai");
  });
  it("形式・語数・難易度が合わないものは拒否する", () => {
    expect(validateGeneratedQuestion({ ...raw, question: "Should students use phones?" }, "x", undefined).ok).toBe(false);
    expect(validateGeneratedQuestion({ ...raw, modelAnswer: "I think so. First, yes. Second, no." }, "x", undefined).ok).toBe(false);
    expect(validateGeneratedQuestion({ ...raw, questionJp: "Japanese please" }, "x", undefined).ok).toBe(false);
    expect(validateGeneratedQuestion({ ...raw, ideas: [] }, "x", undefined).ok).toBe(false);
    expect(validateGeneratedQuestion(raw, "x", undefined, (w) => w.length > 6).ok).toBe(false);
  });
});

describe("復習の間隔", () => {
  const today = "2026-10-27";
  it("翌日→3日後→7日後→14日後と進み、最後に正解すると卒業する", () => {
    let cards = addOrResetCard([], { id: "drill:gr-01", kind: "drill", refId: "gr-01", tag: "agreement" }, today);
    expect(cards[0].due).toBe(addDays(today, REVIEW_INTERVALS[0]));
    const dues: string[] = [];
    for (let i = 1; i < REVIEW_INTERVALS.length; i++) {
      cards = applyReview(cards, "drill:gr-01", true, today);
      dues.push(cards[0].due);
    }
    expect(dues).toEqual([addDays(today, 3), addDays(today, 7), addDays(today, 14)]);
    cards = applyReview(cards, "drill:gr-01", true, today);
    expect(cards).toHaveLength(0);
  });
  it("間違えると翌日からやり直し", () => {
    let cards = addOrResetCard([], { id: "c", kind: "drill", refId: "gr-01", tag: "tense" }, today);
    cards = applyReview(cards, "c", true, today);
    cards = applyReview(cards, "c", false, today);
    expect(cards[0].stage).toBe(0);
    expect(cards[0].due).toBe(addDays(today, 1));
  });
  it("期限が来たものだけを返す", () => {
    const cards = addOrResetCard([], { id: "c", kind: "drill", refId: "gr-01", tag: "tense" }, today);
    expect(dueCards(cards, today)).toHaveLength(0);
    expect(dueCards(cards, addDays(today, 1))).toHaveLength(1);
  });
});

describe("苦手分野の分析", () => {
  it("英作文が少ないうちは習熟度を出さない", () => {
    const a = analyze([attempt(1, [2, 2, 2, 2])], []);
    expect(a.mastery[0].average).toBeNull();
    expect(a.essays).toBeLessThan(MIN_ESSAYS);
  });
  it("少ない解答数では断定しない（tentative にとどめる）", () => {
    const a = analyze([], drills(2, false, "article"));
    expect(a.weak).toHaveLength(0);
    expect(a.tentative.map((t) => t.tag)).toContain("article");
  });
  it("十分な数があり、ミスが多い分野を苦手と判定する", () => {
    const a = analyze([], [...drills(6, false, "tense"), ...drills(6, true, "article")]);
    expect(a.weak.map((t) => t.tag)).toContain("tense");
    expect(a.weak.map((t) => t.tag)).not.toContain("article");
  });
  it("直近の結果を重く数える", () => {
    const old = drills(6, false, "plural").map((d, i) => ({ ...d, at: new Date(2026, 8, 1, 0, i).toISOString() }));
    const recent = drills(6, true, "plural").map((d, i) => ({ ...d, at: new Date(2026, 9, 1, 0, i).toISOString() }));
    const a = analyze([], [...old, ...recent]);
    const plural = a.tags.find((t) => t.tag === "plural")!;
    expect(plural.rate).toBeLessThan(0.5);
    expect(plural.trend).toBe("improving");
  });
  it("4観点の習熟度を出す", () => {
    const a = analyze([attempt(1, [1, 1, 1, 1]), attempt(2, [2, 2, 2, 2]), attempt(3, [4, 4, 4, 4])], []);
    const content = a.mastery.find((m) => m.criterion === "content")!;
    expect(content.average).not.toBeNull();
    expect(content.average!).toBeGreaterThan(2.3); // 新しい4点を重く数える
  });
});

describe("学習ステージと今日のメニュー", () => {
  it("ドリルが少ないうちは第1段階", () => {
    expect(currentStage([], [])).toBe(1);
  });
  it("条件を満たすと順に進み、飛び級はしない", () => {
    const d = drills(20, true);
    expect(currentStage([], d)).toBe(2);
    const good = [attempt(1, [3, 3, 3, 3]), attempt(2, [3, 3, 3, 3]), attempt(3, [3, 3, 3, 3])];
    expect(currentStage(good, d)).toBe(6); // 20分以内に書いた3本の平均が11点以上
    const slow = [1, 2, 3].map((i) => attempt(i, [3, 3, 3, 3], [], 30 * 60));
    expect(currentStage(slow, d)).toBe(5); // 時間をかけすぎると第5段階にとどまる
    const weakOrg = [1, 2, 3].map((i) => attempt(i, [3, 2, 3, 3]));
    expect(currentStage(weakOrg, d)).toBe(2); // 構成が弱いと第2段階
    const weakContent = [1, 2, 3].map((i) => attempt(i, [2, 3, 3, 3]));
    expect(currentStage(weakContent, d)).toBe(3);
  });
  it("メニューは合計15分の4ステップ", () => {
    const a = analyze([], []);
    const plan = buildDailyPlan({ profile, attempts: [], drills: [], analysis: a, dueReviews: 0, today: "2026-10-27" });
    expect(plan.steps.map((s) => s.key)).toEqual(["review", "basic", "writing", "check"]);
    expect(plan.steps.reduce((s, x) => s + x.minutes, 0)).toBe(15);
    expect(plan.daysLeft).toBe(89);
    expect(plan.showTemplate).toBe(true);
  });
  it("試験直前は直前対策になり、時間を計る", () => {
    const a = analyze([], []);
    const plan = buildDailyPlan({ profile, attempts: [], drills: [], analysis: a, dueReviews: 0, today: "2027-01-10" });
    expect(plan.finalPhase).toBe(true);
    expect(plan.timed).toBe(true);
  });
  it("苦手が改善していなければ基礎問題を増やす", () => {
    const flat = [...drills(10, false, "tense")];
    const a = analyze([], flat);
    const plan = buildDailyPlan({ profile, attempts: [], drills: flat, analysis: a, dueReviews: 0, today: "2026-10-27" });
    expect(plan.extraBasics).toBe(true);
  });
});

describe("学習日数", () => {
  it("連続日数と今週の日数", () => {
    const days = new Set(["2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(streak(days, "2026-10-27")).toBe(3); // 今日まだでも昨日まで続いていれば数える
    expect(streak(days, "2026-10-28")).toBe(0);
    expect(daysThisWeek(new Set(["2026-10-26", "2026-10-27", "2026-10-25"]), "2026-10-27")).toBe(2); // 10/26(月)はじまり
  });
});
