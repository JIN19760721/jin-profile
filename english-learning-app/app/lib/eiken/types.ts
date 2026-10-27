// 英検準2級ライティング学習機能の型定義

/** 採点の4観点 */
export type Criterion = "content" | "organization" | "vocabulary" | "grammar";

export const CRITERIA: Criterion[] = ["content", "organization", "vocabulary", "grammar"];

export const CRITERION_LABEL: Record<Criterion, string> = {
  content:      "内容",
  organization: "構成",
  vocabulary:   "語彙",
  grammar:      "文法",
};

/** 弱点タグ（AI添削・ドリルの両方で使う） */
export type WeaknessTag =
  | "content" | "organization" | "vocabulary" | "grammar"
  | "word_count" | "off_topic" | "few_reasons" | "conjunction"
  | "tense" | "article" | "plural" | "agreement" | "word_order";

export const WEAKNESS_TAGS: WeaknessTag[] = [
  "content", "organization", "vocabulary", "grammar",
  "word_count", "off_topic", "few_reasons", "conjunction",
  "tense", "article", "plural", "agreement", "word_order",
];

export const TAG_LABEL: Record<WeaknessTag, string> = {
  content:      "内容",
  organization: "構成",
  vocabulary:   "語彙",
  grammar:      "文法",
  word_count:   "語数不足",
  off_topic:    "質問への回答不足",
  few_reasons:  "理由の不足",
  conjunction:  "接続詞の使い方",
  tense:        "時制",
  article:      "冠詞",
  plural:       "単数・複数",
  agreement:    "主語と動詞の一致",
  word_order:   "語順",
};

/** 意見論述の問題 */
export interface WritingQuestion {
  id:          string;           // 固定問題は "op-01"、AI生成は "ai-xxxxxxxx"
  topic:       string;           // 話題（日本語）
  question:    string;           // QUESTION（英語）
  questionJp:  string;           // 日本語訳
  hintJp:      string;           // 書き方のヒント（日本語）
  ideas:       { side: "yes" | "no"; reasons: string[] }[]; // 理由のアイデア（英語）
  usefulWords: { en: string; jp: string }[];
  modelAnswer: string;           // 模範解答（50〜60語）
  modelJp:     string;           // 模範解答の日本語訳
  focus?:      WeaknessTag;      // AI生成問題が狙う弱点
  source:      "fixed" | "ai";
}

/** 4択の基本文法問題 */
export interface GrammarDrill {
  id:      string;
  kind:    "fill" | "fix";       // fill: 空所補充 / fix: 正しい文を選ぶ
  prompt:  string;               // 問題文（fill は ____ を含む）
  promptJp: string;
  options: string[];
  answer:  number;
  explain: string;
  tag:     WeaknessTag;
}

/** 並べ替え問題 */
export interface ReorderDrill {
  id:     string;
  jp:     string;                // 日本語の意味
  chunks: string[];              // 正しい順番の語句
  explain: string;
  tag:    WeaknessTag;
}

export type CriterionScores = Record<Criterion, number>;

/** 文法添削の1項目 */
export interface Correction {
  before:  string;
  after:   string;
  explain: string;
  tag:     WeaknessTag;
}

/** AI添削の結果（APIの応答をスキーマ検証したもの） */
export interface GradeResult {
  scores:          CriterionScores;
  total:           number;
  goodPoints:      string;
  improvements:    string[];      // 最大3つ
  corrections:     Correction[];
  correctedEssay:  string;
  modelAnswer:     string;
  weaknessTags:    WeaknessTag[];
  wordCount:       number;
}

/** 1回分の解答（書き直しは同じ attempt に積み上げる） */
export interface WritingAttempt {
  id:          string;
  questionId:  string;
  questionText: string;
  format:      "opinion";
  createdAt:   string;           // ISO日時
  rounds:      AttemptRound[];   // 1回目、書き直し…
  reviewDue?:  string;           // 次回の復習日（YYYY-MM-DD）
}

export interface AttemptRound {
  essay:       string;
  result:      GradeResult;
  gradedAt:    string;
  seconds:     number;           // 解答にかかった時間
}

/** ドリルの解答記録 */
export interface DrillRecord {
  drillId:  string;
  kind:     "grammar" | "reorder";
  tag:      WeaknessTag;
  correct:  boolean;
  at:       string;
}

/** 復習カード（間隔反復） */
export interface ReviewCard {
  id:        string;             // "drill:gr-01" / "q:op-03"
  kind:      "drill" | "writing";
  refId:     string;
  tag:       WeaknessTag;
  stage:     number;             // 0:翌日 1:3日後 2:7日後 3:14日後
  due:       string;             // YYYY-MM-DD
  note?:     string;             // 元の間違い（例: I am agree.）
}

/** 学習者プロフィール */
export interface OfficialWritingDetail {
  date:     string;
  opinion:  CriterionScores;     // 意見論述の観点別得点（各0〜4）
}

export interface EikenProfile {
  grade:        string;
  targetExam:   string;
  examDate:     string;          // YYYY-MM-DD
  dailyMinutes: number;
  cse: { reading: number; listening: number; writing: number };
  passLine:     number;
  showTemplate: "auto" | "on" | "off";
  writingDetails: OfficialWritingDetail[];
}

/** 学習時間の記録（日ごと） */
export type StudyMinutes = Record<string, number>; // { "YYYY-MM-DD": 秒 }
