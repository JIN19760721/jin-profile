import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HASH_KEY = "summer_progress";

export interface SummerProgress {
  perWord:       Record<number, { exposure: number; wrong: number }>;
  correctTotal:  number;
  answeredTotal: number;
  coveredWords:  number[];
  lastUpdated:   string;
}

const emptyProgress: SummerProgress = {
  perWord: {}, correctTotal: 0, answeredTotal: 0, coveredWords: [], lastUpdated: "",
};

function redisClient() {
  return new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export async function GET(req: NextRequest) {
  try {
    const nickname = req.nextUrl.searchParams.get("nickname");
    if (!nickname) {
      return NextResponse.json({ error: "ニックネームが必要です" }, { status: 400 });
    }

    const redis = redisClient();
    const raw = await redis.hget<string>(HASH_KEY, nickname);
    const progress: SummerProgress = raw
      ? (typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as SummerProgress))
      : emptyProgress;

    return NextResponse.json({ progress });
  } catch (e) {
    console.error("[summer progress GET]", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nickname, progress } = body as { nickname: string; progress: SummerProgress };

    if (!nickname || typeof nickname !== "string") {
      return NextResponse.json({ error: "ニックネームが必要です" }, { status: 400 });
    }
    if (!progress || typeof progress !== "object") {
      return NextResponse.json({ error: "進捗データが必要です" }, { status: 400 });
    }

    const name = nickname.trim().slice(0, 12);
    const data: SummerProgress = {
      perWord:       progress.perWord ?? {},
      correctTotal:  Math.max(0, Math.floor(Number(progress.correctTotal) || 0)),
      answeredTotal: Math.max(0, Math.floor(Number(progress.answeredTotal) || 0)),
      coveredWords:  Array.isArray(progress.coveredWords) ? progress.coveredWords : [],
      lastUpdated:   new Date().toISOString().split("T")[0],
    };

    const redis = redisClient();
    await redis.hset(HASH_KEY, { [name]: JSON.stringify(data) });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[summer progress POST]", e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
