import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 一時的なユーザー削除用エンドポイント（使用後削除）
export async function POST(req: NextRequest) {
  try {
    const { nickname, confirm } = await req.json();
    if (confirm !== "remove-user-2026-07") {
      return NextResponse.json({ error: "invalid confirm" }, { status: 403 });
    }
    if (!nickname || typeof nickname !== "string") {
      return NextResponse.json({ error: "nickname required" }, { status: 400 });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const keys = await redis.keys("rankings:*");
    const removedFrom: string[] = [];
    for (const key of keys) {
      const removed = await redis.hdel(key, nickname);
      if (removed > 0) removedFrom.push(key);
    }

    return NextResponse.json({ ok: true, nickname, removedFrom });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
