// 学習日数・連続日数・得点推移などの集計

import type { DrillRecord, StudyMinutes, WritingAttempt } from "./types";
import { addDays, localDate } from "./text";

/** 学習した日（端末のローカル日付）の集合 */
export function studyDays(studySec: StudyMinutes, drills: DrillRecord[], attempts: WritingAttempt[]): Set<string> {
  const days = new Set<string>(Object.keys(studySec).filter((d) => studySec[d] > 0));
  drills.forEach((d) => days.add(localDate(new Date(d.at))));
  attempts.forEach((a) => a.rounds.forEach((r) => days.add(localDate(new Date(r.gradedAt)))));
  return days;
}

/** 連続学習日数（今日まだ学習していなくても、昨日まで続いていれば数える） */
export function streak(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/** 今週（月曜はじまり）の学習日数 */
export function daysThisWeek(days: Set<string>, today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 月曜=0
  let n = 0;
  for (let i = 0; i <= dow; i++) if (days.has(addDays(today, -i))) n++;
  return n;
}

/** 英作文の得点推移（1回目の点数、古い順） */
export function scoreTrend(attempts: WritingAttempt[], n = 10) {
  return [...attempts]
    .filter((a) => a.rounds.length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-n)
    .map((a) => ({ date: a.createdAt.slice(5, 10).replace("-", "/"), total: a.rounds[0].result.total, best: Math.max(...a.rounds.map((r) => r.result.total)) }));
}

export function writingAverage(attempts: WritingAttempt[], n = 10): number | null {
  const t = scoreTrend(attempts, n);
  if (t.length === 0) return null;
  return Math.round((t.reduce((s, x) => s + x.total, 0) / t.length) * 10) / 10;
}

/** 直近 days 日の学習時間（分） */
export function minutesByDay(studySec: StudyMinutes, today: string, days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - days + 1);
    return { label: d.slice(5).replace("-", "/"), value: Math.round((studySec[d] ?? 0) / 60) };
  });
}
