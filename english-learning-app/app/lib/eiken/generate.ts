// AI生成問題のスキーマと検証（形式・語数・難易度）

import type { WeaknessTag, WritingQuestion } from "./types";
import { countWords, hasNonEnglish, OPINION_MAX_WORDS, OPINION_MIN_WORDS } from "./text";

export const QUESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "question", "questionJp", "hintJp", "ideas", "usefulWords", "modelAnswer", "modelJp"],
  properties: {
    topic:      { type: "string" },
    question:   { type: "string" },
    questionJp: { type: "string" },
    hintJp:     { type: "string" },
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["side", "reasons"],
        properties: {
          side:    { type: "string", enum: ["yes", "no"] },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
    },
    usefulWords: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["en", "jp"],
        properties: { en: { type: "string" }, jp: { type: "string" } },
      },
    },
    modelAnswer: { type: "string" },
    modelJp:     { type: "string" },
  },
} as const;

const hasJapanese = (s: string) => /[぀-ヿ一-龯]/.test(s);

export interface QuestionCheck {
  ok:      boolean;
  problems: string[];
  question?: WritingQuestion;
}

/**
 * 生成された問題を検証する。
 * isHardWord は難しすぎる単語を判定する関数（サーバーで単語DBを使って渡す）。
 */
export function validateGeneratedQuestion(
  raw: unknown,
  id: string,
  focus: WeaknessTag | undefined,
  isHardWord: (w: string) => boolean = () => false,
): QuestionCheck {
  const problems: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, problems: ["not an object"] };
  const r = raw as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");

  const question = s("question");
  if (!/^Do you think .{10,150}\?$/.test(question)) problems.push("question must be 'Do you think ...?'");
  if (hasNonEnglish(question)) problems.push("question has non-English characters");
  const qWords = countWords(question);
  if (qWords < 6 || qWords > 22) problems.push(`question length ${qWords} words`);

  const modelAnswer = s("modelAnswer");
  const n = countWords(modelAnswer);
  if (n < OPINION_MIN_WORDS || n > OPINION_MAX_WORDS) problems.push(`model answer ${n} words`);
  if (hasNonEnglish(modelAnswer)) problems.push("model answer has non-English characters");
  if (!/\bFirst\b/.test(modelAnswer) || !/\bSecond\b/.test(modelAnswer)) problems.push("model answer needs First/Second");

  const hard = modelAnswer.split(/[^A-Za-z']+/).filter((w) => w.length > 0 && isHardWord(w));
  if (hard.length > 3) problems.push(`too many difficult words: ${hard.slice(0, 5).join(", ")}`);

  for (const k of ["topic", "questionJp", "hintJp", "modelJp"]) {
    if (!hasJapanese(s(k))) problems.push(`${k} must be Japanese`);
  }

  const ideas = Array.isArray(r.ideas) ? r.ideas : [];
  const parsedIdeas: WritingQuestion["ideas"] = [];
  for (const it of ideas) {
    const o = it as Record<string, unknown>;
    if ((o?.side !== "yes" && o?.side !== "no") || !Array.isArray(o.reasons)) continue;
    const reasons = o.reasons.filter((x): x is string => typeof x === "string" && !hasNonEnglish(x)).slice(0, 3);
    if (reasons.length >= 2) parsedIdeas.push({ side: o.side, reasons });
  }
  if (!parsedIdeas.some((i) => i.side === "yes") || !parsedIdeas.some((i) => i.side === "no")) {
    problems.push("ideas need yes and no with 2 reasons each");
  }

  const words = (Array.isArray(r.usefulWords) ? r.usefulWords : [])
    .map((w) => w as Record<string, unknown>)
    .filter((w) => typeof w?.en === "string" && typeof w?.jp === "string")
    .map((w) => ({ en: (w.en as string).trim(), jp: (w.jp as string).trim() }))
    .slice(0, 5);

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    problems,
    question: {
      id, topic: s("topic"), question, questionJp: s("questionJp"), hintJp: s("hintJp"),
      ideas: parsedIdeas, usefulWords: words, modelAnswer, modelJp: s("modelJp"),
      focus, source: "ai",
    },
  };
}
