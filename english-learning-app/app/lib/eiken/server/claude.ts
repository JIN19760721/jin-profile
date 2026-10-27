// Claude API による英作文の採点・問題生成（サーバー専用。APIキーはここでしか使わない）

import Anthropic from "@anthropic-ai/sdk";
import { GRADE_JSON_SCHEMA, parseGradeResult } from "../grade";
import { QUESTION_JSON_SCHEMA, validateGeneratedQuestion } from "../generate";
import { TAG_LABEL, WEAKNESS_TAGS, type GradeResult, type WeaknessTag, type WritingQuestion } from "../types";
import { isHardWord } from "./vocab";

export const MODEL = "claude-opus-5-5";
const FALLBACK_MODEL = "claude-opus-4-8";
const TIMEOUT_MS = 55_000;

export class AiUnavailableError extends Error {}
export class AiBadResponseError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  // 再試行は1回まで（待ち時間と費用が増えすぎないように）
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

const TAG_LIST = WEAKNESS_TAGS.map((t) => `${t}（${TAG_LABEL[t]}）`).join(", ");

const GRADE_SYSTEM = `あなたは英検準2級のライティング（意見論述）を採点・添削する先生です。
学習者は日本の高校1年生で、英語が苦手です。説明は短く、具体的で、やさしい日本語にしてください。

# 問題形式（英検準2級 意見論述）
- QUESTION について、自分の意見とその理由を2つ英文で書く。語数の目安は50〜60語。
- 解答が QUESTION に対応していないと判断される場合は、すべての観点で0点にする。

# 採点の観点（各0〜4点、合計16点）
- content（内容）: 課題で求められている内容（意見と、それに沿った理由2つ）が含まれているか。理由が意見を支えているか。
- organization（構成）: 英文の構成や流れがわかりやすく論理的か。First / Second / For these reasons などのつなぎの表現を適切に使えているか。
- vocabulary（語彙）: 課題にふさわしい語彙を正しく使えているか。同じ語の繰り返しが多すぎないか。
- grammar（文法）: 文の形のバリエーションがあり、それらを正しく使えているか。
- 目安: 4=十分にできている / 3=おおむねできている / 2=一部できている / 1=ほとんどできていない / 0=できていない・評価できない
- 語数が目安より大きく少ない場合は、内容と構成を低めにする。
- この採点は練習用の参考評価であり、公式のCSEスコアには換算しない。

# 出力（JSONのみ）
- goodPoints: 良かったところを日本語で1〜2文。
- improvements: 改善ポイントを日本語で最大3つ。いちばん点数が上がるものから順に。
- corrections: 学習者の英文の誤りを最大6つ。before は学習者が書いた部分をそのまま、after は直した英文、explain は日本語で1文の説明、tag は下の弱点タグから1つ。
  誤りがなければ空の配列にする。直さなくても正しいものは入れない。
- correctedEssay: 学習者の英文を、意味を変えずに最小限だけ直した全文。
- modelAnswer: 同じ QUESTION への模範解答。50〜60語、中学〜高校1年で習う語彙と文法だけを使い、
  「I think ... First, ... Second, ... For these reasons, ...」の形にする。難しい表現は使わない。
- weaknessTags: この答案で見られた弱点タグ（0〜4個）。次の中から選ぶ: ${TAG_LIST}`;

/** 英作文を採点する。形式が崩れた応答は1回だけ取り直す */
export async function gradeEssay(question: string, essay: string): Promise<{ result: GradeResult; usage: Anthropic.Beta.BetaUsage }> {
  const userText = `QUESTION: ${question}\n\n学習者の解答:\n"""\n${essay}\n"""`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await callJson(GRADE_SYSTEM, userText, GRADE_JSON_SCHEMA, 6000);
    const result = parseGradeResult(msg.json, essay);
    if (result) return { result, usage: msg.usage };
  }
  throw new AiBadResponseError("grade response failed validation");
}

const FOCUS_GUIDE: Partial<Record<WeaknessTag | "general", string>> = {
  grammar:      "文法ミスを減らす練習になるよう、現在形・過去形・未来形が自然に使い分けられる話題にする。",
  tense:        "過去の経験や未来の予想を書く必要がある話題にして、時制を意識できるようにする。",
  agreement:    "主語が3人称単数（a student, everyone など）になりやすい話題にする。",
  article:      "数えられる名詞（a/an/the）が多く出る身近な話題にする。",
  plural:       "people, children, students など複数形をよく使う話題にする。",
  vocabulary:   "中学で習う簡単な単語だけで理由を説明できる、身近な話題にする。",
  organization: "賛成・反対の理由が2つはっきり分けて書きやすい話題にする。",
  conjunction:  "because / so / but を使って理由を説明しやすい話題にする。",
  content:      "質問の意味がはっきりしていて、質問に正確に答える練習になる話題にする。",
  off_topic:    "質問の意味がはっきりしていて、質問に正確に答える練習になる話題にする。",
  few_reasons:  "理由を2つ思いつきやすい、とても身近な話題にする。",
  word_count:   "書くことが思いつきやすい身近な話題にする。",
  word_order:   "頻度の副詞（always, usually）や時を表す語を使いやすい日常の話題にする。",
  general:      "高校生にとって身近な、学校・家庭・地域・社会の話題にする。",
};

const GEN_SYSTEM = `あなたは英検準2級のライティング問題を作る先生です。学習者は英語が苦手な日本の高校1年生です。
英検準2級の意見論述と同じ形式の、オリジナルの問題を1つ作ってください（過去問をそのまま使わない）。

- question: "Do you think ...?" の形の英語の質問（6〜20語、準2級レベルのやさしい語彙）。
- questionJp: 質問の日本語訳。 topic: 話題（日本語で短く）。 hintJp: 書き方のヒント（日本語1〜2文）。
- ideas: side が "yes" と "no" のものを1つずつ。それぞれ理由を短い英文で2つ（中学レベルの単語）。
- usefulWords: 役に立つ語句を3〜5個（en と jp）。
- modelAnswer: 50〜60語の模範解答。「I think ... First, ... Second, ... For these reasons, ...」の形。中学〜高校1年の語彙だけを使う。
- modelJp: 模範解答の日本語訳。
- 政治・宗教・暴力など、高校生の学習に向かない話題は避ける。`;

/** 弱点に合わせた問題を生成する。検証に通らなければ null（呼び出し元が固定問題を出す） */
export async function generateQuestion(
  id: string, focus: WeaknessTag | undefined, avoid: string[],
): Promise<{ question: WritingQuestion | null; problems: string[]; usage?: Anthropic.Beta.BetaUsage }> {
  const guide = FOCUS_GUIDE[focus ?? "general"] ?? FOCUS_GUIDE.general;
  const userText = `${guide}\n\n次の質問とは違う話題にしてください:\n${avoid.slice(0, 40).map((q) => `- ${q}`).join("\n")}`;
  const msg = await callJson(GEN_SYSTEM, userText, QUESTION_JSON_SCHEMA, 4000);
  const check = validateGeneratedQuestion(msg.json, id, focus, isHardWord);
  return { question: check.question ?? null, problems: check.problems, usage: msg.usage };
}

async function callJson(system: string, userText: string, schema: object, maxTokens: number) {
  const msg = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // ポリシー上の理由で応答を断られたときは、サーバー側で別モデルに切り替える
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: FALLBACK_MODEL }],
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages: [{ role: "user", content: userText }],
  });
  if (msg.stop_reason === "refusal") throw new AiBadResponseError("refused");
  if (msg.stop_reason === "max_tokens") throw new AiBadResponseError("max_tokens");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { json, usage: msg.usage };
}
