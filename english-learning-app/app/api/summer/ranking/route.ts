import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import type { SummerProgress } from "../progress/route";

export const dynamic = "force-dynamic";

const HASH_KEY = "summer_progress";

export interface SummerRankEntry {
  nickname:       string;
  accuracyPct:    number;
  accuracyPoints: number;
  coveragePoints: number;
  coveredCount:   number;
  totalScore:     number;
  rank:           number;
}

function computeEntry(nickname: string, p: SummerProgress): SummerRankEntry {
  const accuracyPct    = p.answeredTotal > 0 ? (p.correctTotal / p.answeredTotal) * 100 : 0;
  const accuracyPoints = Math.max(0, Math.min(100, Math.round(accuracyPct)));
  const coveredCount   = p.coveredWords?.length ?? 0;
  const coveragePoints = Math.round(Math.min(400, coveredCount) * 0.5 * 10) / 10;
  return {
    nickname,
    accuracyPct: Math.round(accuracyPct * 10) / 10,
    accuracyPoints,
    coveragePoints,
    coveredCount,
    totalScore: Math.round((accuracyPoints + coveragePoints) * 10) / 10,
    rank: 0,
  };
}

export async function GET() {
  try {
    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const raw = await redis.hgetall<Record<string, string>>(HASH_KEY);
    const entries = Object.entries(raw ?? {}).map(([nickname, v]) => {
      const p = (typeof v === "string" ? JSON.parse(v) : v) as SummerProgress;
      return computeEntry(nickname, p);
    });

    entries.sort((a, b) => b.totalScore - a.totalScore);

    let i = 0;
    const ranking: SummerRankEntry[] = [];
    while (i < entries.length) {
      let j = i + 1;
      while (j < entries.length && entries[j].totalScore === entries[i].totalScore) j++;
      for (let k = i; k < j; k++) ranking.push({ ...entries[k], rank: i + 1 });
      i = j;
    }

    return NextResponse.json({ ranking });
  } catch (e) {
    console.error("[summer ranking GET]", e);
    return NextResponse.json({ error: "ランキングの取得に失敗しました" }, { status: 500 });
  }
}
