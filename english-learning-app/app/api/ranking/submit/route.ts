import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function currentKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `rankings:${y}-${m}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nickname, quizAvg, streak, totalWords } = body as {
      nickname: string;
      quizAvg: number;
      streak: number;
      totalWords: number;
    };

    if (!nickname || typeof nickname !== "string") {
      return NextResponse.json({ error: "ニックネームが必要です" }, { status: 400 });
    }
    const name = nickname.trim().slice(0, 12);
    if (!name) {
      return NextResponse.json({ error: "ニックネームが必要です" }, { status: 400 });
    }

    const data = {
      nickname:    name,
      quizAvg:     Math.round(Math.max(0, Math.min(100, Number(quizAvg) || 0)) * 10) / 10,
      streak:      Math.max(0, Math.floor(Number(streak) || 0)),
      totalWords:  Math.max(0, Math.floor(Number(totalWords) || 0)),
      lastUpdated: new Date().toISOString().split("T")[0],
    };

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    await redis.hset(currentKey(), { [name]: JSON.stringify(data) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ranking submit]", e);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
