import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type UserData = {
  nickname: string;
  quizAvg: number;
  streak: number;
  totalWords: number;
  lastUpdated: string;
};

type RankedEntry = {
  nickname: string;
  value: number;
  rank: number;
  points: number;
};

type OverallEntry = {
  nickname: string;
  totalPoints: number;
  rank: number;
};

type Rankings = {
  quizAvg:    RankedEntry[];
  streak:     RankedEntry[];
  totalWords: RankedEntry[];
  overall:    OverallEntry[];
};

// rankings:YYYY-MM 形式のキーを生成
function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `rankings:${y}-${m}`;
}

function currentKey(): string { return monthKey(new Date()); }

function prevKey(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}

// YYYY-MM → YYYY年M月
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m)}月`;
}

function parseUsers(raw: Record<string, string> | null): UserData[] {
  if (!raw) return [];
  return Object.values(raw).map((v) =>
    typeof v === "string" ? JSON.parse(v) : (v as UserData)
  );
}

function computePoints(users: UserData[], key: "quizAvg" | "streak" | "totalWords"): RankedEntry[] {
  const n = users.length;
  const sorted = [...users].sort((a, b) => b[key] - a[key]);
  const result: RankedEntry[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && sorted[j][key] === sorted[i][key]) j++;
    const avgPoints = n - (i + j - 1) / 2;
    for (let k = i; k < j; k++) {
      result.push({
        nickname: sorted[k].nickname,
        value: sorted[k][key],
        rank: i + 1,
        points: Math.round(avgPoints * 10) / 10,
      });
    }
    i = j;
  }
  return result;
}

function computeOverall(
  byQuizAvg: RankedEntry[],
  byStreak: RankedEntry[],
  byTotalWords: RankedEntry[],
): OverallEntry[] {
  const ptMap: Record<string, number> = {};
  for (const e of [...byQuizAvg, ...byStreak, ...byTotalWords]) {
    ptMap[e.nickname] = (ptMap[e.nickname] ?? 0) + e.points;
  }
  const sorted = Object.entries(ptMap)
    .map(([nickname, totalPoints]) => ({ nickname, totalPoints }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
  const result: OverallEntry[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].totalPoints === sorted[i].totalPoints) j++;
    for (let k = i; k < j; k++) result.push({ ...sorted[k], rank: i + 1 });
    i = j;
  }
  return result;
}

function computeRankings(users: UserData[]): Rankings {
  const byQuizAvg    = computePoints(users, "quizAvg");
  const byStreak     = computePoints(users, "streak");
  const byTotalWords = computePoints(users, "totalWords");
  const overall      = computeOverall(byQuizAvg, byStreak, byTotalWords);
  return { quizAvg: byQuizAvg, streak: byStreak, totalWords: byTotalWords, overall };
}

export async function GET() {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const curKey  = currentKey();
    const prevKey_ = prevKey();
    const curYM   = curKey.split(":")[1];
    const prevYM  = prevKey_.split(":")[1];

    const [curRaw, prevRaw] = await Promise.all([
      redis.hgetall<Record<string, string>>(curKey),
      redis.hgetall<Record<string, string>>(prevKey_),
    ]);

    // 今月ランキング
    const users = parseUsers(curRaw);
    const rankings = users.length > 0 ? computeRankings(users) : null;

    // 先月チャンピオン（各カテゴリ1位）
    const prevUsers = parseUsers(prevRaw);
    let prevChampions = null;
    if (prevUsers.length > 0) {
      const pr = computeRankings(prevUsers);
      prevChampions = {
        overall:    pr.overall[0]    ?? null,
        quizAvg:    pr.quizAvg[0]    ?? null,
        streak:     pr.streak[0]     ?? null,
        totalWords: pr.totalWords[0] ?? null,
      };
    }

    return NextResponse.json({
      month:         curYM,
      monthLabel:    monthLabel(curYM),
      prevMonth:     prevYM,
      prevMonthLabel: monthLabel(prevYM),
      users,
      rankings,
      prevChampions,
    });
  } catch (e) {
    console.error("[ranking GET]", e);
    return NextResponse.json({ error: "ランキングの取得に失敗しました" }, { status: 500 });
  }
}
