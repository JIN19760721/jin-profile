import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { WRITING_QUESTIONS } from "../../../../data/eikenWriting";
import { WEAKNESS_TAGS, type WeaknessTag } from "../../../../lib/eiken/types";
import { AiBadResponseError, AiUnavailableError, generateQuestion } from "../../../../lib/eiken/server/claude";
import {
  cachedQuestions, cacheQuestion, clientId, consumeQuota, LimitUnavailableError, refundQuota,
} from "../../../../lib/eiken/server/limits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 弱点に合わせた新しい問題を返す。
 * まずキャッシュから学習者がまだ解いていない問題を探し、なければ生成する。
 * 生成・検証に失敗したら { question: null, fallback: true } を返し、画面側で固定問題を出す。
 */
export async function POST(req: NextRequest) {
  let body: { focus?: unknown; seenIds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "リクエストの形式が正しくありません" }, { status: 400 }); }

  const focus = typeof body.focus === "string" && (WEAKNESS_TAGS as string[]).includes(body.focus)
    ? (body.focus as WeaknessTag) : undefined;
  const seen = new Set(Array.isArray(body.seenIds)
    ? body.seenIds.filter((x): x is string => typeof x === "string").slice(0, 500) : []);

  const client = clientId(req);
  let quotaTaken = false;
  try {
    const cached = await cachedQuestions(focus ?? "general");
    const unseen = cached.find((q) => !seen.has(q.id));
    if (unseen) return NextResponse.json({ question: unseen, cached: true });

    const quota = await consumeQuota(client);
    if (!quota.ok) return NextResponse.json({ question: null, fallback: true, reason: "limit", quota });
    quotaTaken = true;

    const avoid = [...WRITING_QUESTIONS.map((q) => q.question), ...cached.map((q) => q.question)];
    const id = `ai-${randomBytes(4).toString("hex")}`;
    const { question, problems } = await generateQuestion(id, focus, avoid);
    if (!question) {
      console.warn("[eiken generate] rejected", problems.join("; "));
      return NextResponse.json({ question: null, fallback: true, reason: "invalid", quota });
    }
    await cacheQuestion(focus ?? "general", question);
    return NextResponse.json({ question, cached: false, quota });
  } catch (e) {
    if (e instanceof LimitUnavailableError || e instanceof AiUnavailableError) {
      return NextResponse.json({ question: null, fallback: true, reason: "unavailable" });
    }
    if (quotaTaken && (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.RateLimitError)) {
      await refundQuota(client).catch(() => {});
    }
    if (!(e instanceof AiBadResponseError)) console.error("[eiken generate]", e);
    return NextResponse.json({ question: null, fallback: true, reason: "error" });
  }
}
