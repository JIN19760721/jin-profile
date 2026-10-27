// 学習ステージと「今日の15分」メニューの組み立て

import type { Analysis } from "./analysis";
import type { DrillRecord, EikenProfile, WeaknessTag, WritingAttempt } from "./types";
import { daysBetween } from "./text";

export interface Stage {
  no:      number;
  title:   string;
  goal:    string;              // 次のステージに進む条件（学習者向けの説明）
}

export const STAGES: Stage[] = [
  { no: 1, title: "英文の基本構造",       goal: "文法・並べ替えドリルを20問以上解いて、正答率70%以上" },
  { no: 2, title: "意見と理由の書き方",   goal: "英作文を3本以上書いて、構成の平均が3点以上" },
  { no: 3, title: "理由をくわしく書く",   goal: "直近3本の内容の平均が3点以上" },
  { no: 4, title: "実践問題",             goal: "直近3本の合計点の平均が10点以上" },
  { no: 5, title: "時間制限付き演習",     goal: "20分以内で書いた直近3本の平均が11点以上" },
  { no: 6, title: "弱点克服・直前対策",   goal: "試験日まで弱点を中心に練習" },
];

/** 試験前のこの日数を切ったら直前対策を重視する */
export const FINAL_PHASE_DAYS = 21;
/** 時間制限付き演習の制限時間（秒） */
export const TIMED_LIMIT_SEC = 20 * 60;

const recentFirstRounds = (attempts: WritingAttempt[], n: number) =>
  [...attempts]
    .filter((a) => a.rounds.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n)
    .map((a) => a.rounds[0]);

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** 到達しているステージ（条件を満たしたところまで順番に進む。飛び級はしない） */
export function currentStage(attempts: WritingAttempt[], drills: DrillRecord[]): number {
  const recentDrills = drills.slice(-40);
  if (recentDrills.length < 20 || avg(recentDrills.map((d) => (d.correct ? 1 : 0))) < 0.7) return 1;

  const all = recentFirstRounds(attempts, 100);
  const last3 = all.slice(0, 3);
  if (all.length < 3 || avg(last3.map((r) => r.result.scores.organization)) < 3) return 2;
  if (avg(last3.map((r) => r.result.scores.content)) < 3) return 3;
  if (avg(last3.map((r) => r.result.total)) < 10) return 4;

  const timed = all.filter((r) => r.seconds > 0 && r.seconds <= TIMED_LIMIT_SEC).slice(0, 3);
  if (timed.length < 3 || avg(timed.map((r) => r.result.total)) < 11) return 5;
  return 6;
}

export function daysUntilExam(profile: EikenProfile, today: string): number {
  return daysBetween(today, profile.examDate);
}

export interface DailyStep {
  key:     "review" | "basic" | "writing" | "check";
  title:   string;
  minutes: number;
  detail:  string;
}

export interface DailyPlan {
  stage:        Stage;
  daysLeft:     number;
  finalPhase:   boolean;
  focusTags:    WeaknessTag[];   // 今日重点的に練習する弱点
  extraBasics:  boolean;         // 苦手が改善しないので基礎問題を追加する
  showTemplate: boolean;
  timed:        boolean;
  steps:        DailyStep[];
  note:         string;
}

export function buildDailyPlan(args: {
  profile:   EikenProfile;
  attempts:  WritingAttempt[];
  drills:    DrillRecord[];
  analysis:  Analysis;
  dueReviews: number;
  today:     string;
}): DailyPlan {
  const { profile, attempts, drills, analysis, dueReviews, today } = args;
  const stageNo = currentStage(attempts, drills);
  const daysLeft = daysUntilExam(profile, today);
  const finalPhase = daysLeft >= 0 && daysLeft <= FINAL_PHASE_DAYS;

  const focusTags = analysis.weak.map((t) => t.tag);
  // 弱点のミス率が下がっていなければ、先に進まずに基礎ドリルを増やす
  const extraBasics = analysis.weak.some((t) => t.trend === "flat" || t.trend === "worse");

  const showTemplate =
    profile.showTemplate === "on" ? true :
    profile.showTemplate === "off" ? false :
    stageNo <= 3;
  const timed = stageNo >= 5 || finalPhase;

  const basicDetail = extraBasics
    ? "苦手な分野の基礎問題を多めに出します（文法5問＋並べ替え3問）"
    : stageNo <= 2 ? "文法3問＋並べ替え2問" : "並べ替え3問＋文法2問";

  const steps: DailyStep[] = [
    { key: "review",  title: "前回の復習",       minutes: 3,
      detail: dueReviews > 0 ? `復習が${dueReviews}問あります` : "苦手な分野の問題を3問" },
    { key: "basic",   title: "英作文基礎練習",   minutes: 4, detail: basicDetail },
    { key: "writing", title: "ライティング実践", minutes: 6,
      detail: timed ? "本番と同じく時間を計って1本書きます"
        : stageNo <= 1 ? "テンプレートを見ながら意見と理由を書きます"
        : "意見論述を1本書いてAIで採点します" },
    { key: "check",   title: "添削結果の確認",   minutes: 2, detail: "直されたところを読んで、書き直しに挑戦します" },
  ];

  let note = "";
  if (daysLeft < 0) note = "試験日が過ぎています。プロフィールで次の試験日を設定してください。";
  else if (finalPhase) note = `試験まであと${daysLeft}日です。弱点の復習と時間を計った練習を中心にします。`;
  else if (extraBasics) note = "苦手な分野がまだ改善していないので、先に進む前に基礎問題を増やしています。";
  else {
    const weeks = Math.max(1, Math.floor(daysLeft / 7));
    const remaining = STAGES.length - stageNo;
    note = remaining > 0
      ? `試験まであと${daysLeft}日（約${weeks}週間）。残り${remaining}段階なので、${Math.max(1, Math.floor(weeks / remaining))}週間に1段階が目安です。`
      : `試験まであと${daysLeft}日です。`;
  }

  return { stage: STAGES[stageNo - 1], daysLeft, finalPhase, focusTags, extraBasics, showTemplate, timed, steps, note };
}
