import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 一時的なリセット用エンドポイント（使用後削除）
export async function POST(req: NextRequest) {
  try {
    const { confirm } = await req.json();
    if (confirm !== "reset-rankings-2026-07") {
      return NextResponse.json({ error: "invalid confirm" }, { status: 403 });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // 今月分と旧形式キーを削除
    const deleted = await redis.del("rankings:2026-07", "rankings");
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
