// AI添削結果のスキーマと検証（サーバーで使い、テストでも使う）

import { CRITERIA, WEAKNESS_TAGS, type Correction, type GradeResult, type WeaknessTag } from "./types";
import { countWords } from "./text";

const SCORE_ENUM = [0, 1, 2, 3, 4];

/** Claude の structured outputs に渡す JSON Schema */
export const GRADE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "goodPoints", "improvements", "corrections", "correctedEssay", "modelAnswer", "weaknessTags"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["content", "organization", "vocabulary", "grammar"],
      properties: {
        content:      { type: "integer", enum: SCORE_ENUM },
        organization: { type: "integer", enum: SCORE_ENUM },
        vocabulary:   { type: "integer", enum: SCORE_ENUM },
        grammar:      { type: "integer", enum: SCORE_ENUM },
      },
    },
    goodPoints:   { type: "string" },
    improvements: { type: "array", items: { type: "string" } },
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["before", "after", "explain", "tag"],
        properties: {
          before:  { type: "string" },
          after:   { type: "string" },
          explain: { type: "string" },
          tag:     { type: "string", enum: WEAKNESS_TAGS },
        },
      },
    },
    correctedEssay: { type: "string" },
    modelAnswer:    { type: "string" },
    weaknessTags:   { type: "array", items: { type: "string", enum: WEAKNESS_TAGS } },
  },
} as const;

const isTag = (v: unknown): v is WeaknessTag => typeof v === "string" && (WEAKNESS_TAGS as string[]).includes(v);
const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

/**
 * AIの応答を検証して GradeResult にする。形が崩れていれば null。
 * 合計点と語数はAIの値を信用せずに計算し直す。
 */
export function parseGradeResult(raw: unknown, essay: string): GradeResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = r.scores as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") return null;

  const scores = {} as GradeResult["scores"];
  for (const c of CRITERIA) {
    const v = s[c];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 4) return null;
    scores[c] = v;
  }

  const goodPoints = str(r.goodPoints, 400);
  const correctedEssay = str(r.correctedEssay, 1200);
  const modelAnswer = str(r.modelAnswer, 1200);
  if (!goodPoints || !correctedEssay || !modelAnswer) return null;

  if (!Array.isArray(r.improvements)) return null;
  const improvements = r.improvements
    .map((v) => str(v, 300))
    .filter((v): v is string => v !== null)
    .slice(0, 3);

  if (!Array.isArray(r.corrections)) return null;
  const corrections: Correction[] = [];
  for (const c of r.corrections.slice(0, 8)) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const before = str(o.before, 300), after = str(o.after, 300), explain = str(o.explain, 300);
    if (!before || !after || !explain || !isTag(o.tag) || before === after) continue;
    corrections.push({ before, after, explain, tag: o.tag });
  }

  if (!Array.isArray(r.weaknessTags)) return null;
  const tags = new Set<WeaknessTag>(r.weaknessTags.filter(isTag));
  const wordCount = countWords(essay);
  // 語数不足はAIに任せず機械的に付ける
  if (wordCount < 40) tags.add("word_count");

  return {
    scores,
    total: CRITERIA.reduce((sum, c) => sum + scores[c], 0),
    goodPoints,
    improvements,
    corrections,
    correctedEssay,
    modelAnswer,
    weaknessTags: [...tags],
    wordCount,
  };
}
