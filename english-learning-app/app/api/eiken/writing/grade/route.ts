import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { WRITING_QUESTIONS } from "../../../../data/eikenWriting";
import { countWords, hasNonEnglish, MAX_ESSAY_CHARS, normalizeEssay } from "../../../../lib/eiken/text";
import { AiBadResponseError, AiUnavailableError, gradeEssay } from "../../../../lib/eiken/server/claude";
import {
  acquireLock, clientId, consumeQuota, LimitUnavailableError, refundQuota, releaseLock, sha,
} from "../../../../lib/eiken/server/limits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const err = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

export async function POST(req: NextRequest) {
  let body: { questionId?: unknown; question?: unknown; essay?: unknown };
  try { body = await req.json(); } catch { return err(400, "リクエストの形式が正しくありません"); }

  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  const fixed = WRITING_QUESTIONS.find((q) => q.id === questionId);
  // 固定問題はサーバーの問題文を使う。AI生成問題だけ送られた問題文を受け付ける（形式を確認）
  const question = fixed?.question
    ?? (typeof body.question === "string" && /^Do you think .{10,150}\?$/.test(body.question.trim())
      && !hasNonEnglish(body.question) ? body.question.trim() : null);
  if (!question) return err(400, "問題が見つかりません");

  const essay = typeof body.essay === "string" ? normalizeEssay(body.essay) : "";
  if (!essay) return err(400, "英文を入力してください");
  if (essay.length > MAX_ESSAY_CHARS) return err(400, `英文が長すぎます（${MAX_ESSAY_CHARS}文字まで）`);
  if (hasNonEnglish(essay)) return err(400, "日本語や全角文字が入っています。英語だけで書いてください");
  if (countWords(essay) < 10) return err(400, "10語以上書いてから採点してください");

  const lockName = sha(`${question}\n${essay}`);
  const client = clientId(req);
  let quotaTaken = false;
  try {
    if (!(await acquireLock(lockName))) return err(409, "この英文は採点中です。少し待ってください");
    try {
      const quota = await consumeQuota(client);
      if (!quota.ok) {
        return err(429, quota.reason === "global"
          ? "今日のAI採点の受付は終了しました。明日また使えます"
          : `AI採点は1日${quota.limit}回までです。明日また使えます`, { quota });
      }
      quotaTaken = true;
      const { result, usage } = await gradeEssay(question, essay);
      console.log("[eiken grade] usage", JSON.stringify({
        in: usage.input_tokens, out: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens, cacheWrite: usage.cache_creation_input_tokens,
      }));
      return NextResponse.json({ result, quota });
    } finally {
      await releaseLock(lockName).catch(() => {});
    }
  } catch (e) {
    if (e instanceof LimitUnavailableError) return err(503, "利用回数を確認できないため、AI採点を一時的に止めています");
    if (e instanceof AiUnavailableError) {
      if (quotaTaken) await refundQuota(client).catch(() => {});
      return err(503, "AI採点が設定されていません");
    }
    if (e instanceof AiBadResponseError) {
      console.error("[eiken grade] bad response", e.message);
      return err(502, "AIの採点結果を読み取れませんでした。もう一度試してください");
    }
    if (e instanceof Anthropic.RateLimitError) {
      if (quotaTaken) await refundQuota(client).catch(() => {});
      return err(503, "AIが混み合っています。少し待ってから試してください");
    }
    if (e instanceof Anthropic.APIConnectionError) {
      // タイムアウトも含む（課金されていない可能性が高いので回数を戻す）
      if (quotaTaken) await refundQuota(client).catch(() => {});
      return err(504, "AIの応答が時間内に返りませんでした。もう一度試してください");
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[eiken grade] api error", e.status, e.message);
      if (quotaTaken) await refundQuota(client).catch(() => {});
      return err(502, "AI採点でエラーが起きました");
    }
    console.error("[eiken grade]", e);
    return err(500, "採点に失敗しました");
  }
}
