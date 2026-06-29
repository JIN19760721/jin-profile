import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
      nickname: name,
      quizAvg:    Math.round(Math.max(0, Math.min(100, Number(quizAvg) || 0)) * 10) / 10,
      streak:     Math.max(0, Math.floor(Number(streak) || 0)),
      totalWords: Math.max(0, Math.floor(Number(totalWords) || 0)),
      lastUpdated: new Date().toISOString().split("T")[0],
    };

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    await redis.hset("rankings", { [name]: JSON.stringify(data) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ranking submit]", e);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
