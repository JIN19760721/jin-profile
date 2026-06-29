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

function computePoints(users: UserData[], key: "quizAvg" | "streak" | "totalWords"): RankedEntry[] {
  const n = users.length;
  const sorted = [...users].sort((a, b) => b[key] - a[key]);
  const result: RankedEntry[] = [];

  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && sorted[j][key] === sorted[i][key]) j++;
    // Average points for tied group: n - (i + j - 1) / 2
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

  const overall: OverallEntry[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].totalPoints === sorted[i].totalPoints) j++;
    for (let k = i; k < j; k++) {
      overall.push({ ...sorted[k], rank: i + 1 });
    }
    i = j;
  }
  return overall;
}

export async function GET() {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const raw = await redis.hgetall<Record<string, string>>("rankings");
    if (!raw) return NextResponse.json({ users: [], rankings: null });

    const users: UserData[] = Object.values(raw).map((v) =>
      typeof v === "string" ? JSON.parse(v) : (v as UserData)
    );

    if (users.length === 0) return NextResponse.json({ users: [], rankings: null });

    const byQuizAvg    = computePoints(users, "quizAvg");
    const byStreak     = computePoints(users, "streak");
    const byTotalWords = computePoints(users, "totalWords");
    const overall      = computeOverall(byQuizAvg, byStreak, byTotalWords);

    return NextResponse.json({
      users,
      rankings: { quizAvg: byQuizAvg, streak: byStreak, totalWords: byTotalWords, overall },
    });
  } catch (e) {
    console.error("[ranking GET]", e);
    return NextResponse.json({ error: "ランキングの取得に失敗しました" }, { status: 500 });
  }
}
