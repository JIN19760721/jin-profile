// 画面側からAPIを呼ぶ処理

import type { GradeResult, WeaknessTag, WritingQuestion } from "./types";
import { normalizeEssay } from "./text";

/** 同じ問題・同じ答案かどうかを見分けるキー（FNV-1a） */
export function essayKey(questionId: string, essay: string): string {
  const s = `${questionId}\n${normalizeEssay(essay)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${s.length}`;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError("インターネットに接続されていません。接続してからもう一度試してください", 0);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    let json: Record<string, unknown> = {};
    try { json = await res.json(); } catch {}
    if (!res.ok) throw new ApiError(typeof json.error === "string" ? json.error : `エラーが起きました（${res.status}）`, res.status);
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("時間がかかりすぎたため中断しました。もう一度試してください", 0);
    }
    throw new ApiError("通信に失敗しました。電波の良いところでもう一度試してください", 0);
  } finally {
    clearTimeout(timer);
  }
}

export interface Quota { used: number; limit: number }

export function requestGrade(questionId: string, question: string, essay: string) {
  return postJson<{ result: GradeResult; quota: Quota }>(
    "/api/eiken/writing/grade", { questionId, question, essay }, 70_000,
  );
}

export function requestQuestion(focus: WeaknessTag | undefined, seenIds: string[]) {
  return postJson<{ question: WritingQuestion | null; fallback?: boolean; reason?: string; quota?: Quota }>(
    "/api/eiken/writing/generate", { focus, seenIds }, 70_000,
  );
}
