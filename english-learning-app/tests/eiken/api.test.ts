// API のテスト（Claude API は呼ばずに差し替える。Redis は未設定なのでメモリで数える）
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../app/lib/eiken/server/claude", async (orig) => {
  const real = await orig<typeof import("../../app/lib/eiken/server/claude")>();
  return { ...real, gradeEssay: vi.fn(), generateQuestion: vi.fn() };
});

import { POST as grade } from "../../app/api/eiken/writing/grade/route";
import { POST as generate } from "../../app/api/eiken/writing/generate/route";
import * as claude from "../../app/lib/eiken/server/claude";
import { consumeQuota, DAILY_LIMIT_PER_CLIENT } from "../../app/lib/eiken/server/limits";
import { WRITING_QUESTIONS } from "../../app/data/eikenWriting";

const ESSAY = "I think students should not use smartphones at school. First, they may play games in class. Second, they do not talk with friends.";
let ipSeq = 0;

function req(url: string, body: unknown, ip = `10.0.0.${++ipSeq}`) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

const okResult = {
  scores: { content: 3, organization: 3, vocabulary: 3, grammar: 3 }, total: 12, goodPoints: "良い", improvements: [],
  corrections: [], correctedEssay: ESSAY, modelAnswer: "x", weaknessTags: [], wordCount: 23,
};

beforeEach(() => {
  vi.mocked(claude.gradeEssay).mockReset();
  vi.mocked(claude.generateQuestion).mockReset();
});

describe("利用回数の制限", () => {
  it(`1日${DAILY_LIMIT_PER_CLIENT}回まで`, async () => {
    for (let i = 0; i < DAILY_LIMIT_PER_CLIENT; i++) expect((await consumeQuota("quota-test")).ok).toBe(true);
    const over = await consumeQuota("quota-test");
    expect(over.ok).toBe(false);
    expect(over.reason).toBe("client");
  });
});

describe("POST /api/eiken/writing/grade", () => {
  it("採点結果を返す（固定問題はサーバー側の問題文を使う）", async () => {
    vi.mocked(claude.gradeEssay).mockResolvedValue({ result: okResult, usage: { input_tokens: 1, output_tokens: 1 } as never });
    const res = await grade(req("/api/eiken/writing/grade", { questionId: "op-01", question: "ignored", essay: ESSAY }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.total).toBe(12);
    expect(vi.mocked(claude.gradeEssay).mock.calls[0][0]).toBe(WRITING_QUESTIONS[0].question);
  });

  it("入力の誤りは400（AIを呼ばない）", async () => {
    const cases = [
      "not json",
      { questionId: "op-01", essay: "" },
      { questionId: "op-01", essay: "Too short." },
      { questionId: "op-01", essay: ESSAY + " 日本語" },
      { questionId: "op-01", essay: "word ".repeat(400) },
      { questionId: "unknown", question: "Tell me a secret", essay: ESSAY },
    ];
    for (const body of cases) {
      const res = await grade(req("/api/eiken/writing/grade", body));
      expect(res.status).toBe(400);
    }
    expect(claude.gradeEssay).not.toHaveBeenCalled();
  });

  it("AI生成問題の問題文は Do you think ...? の形だけ受け付ける", async () => {
    vi.mocked(claude.gradeEssay).mockResolvedValue({ result: okResult, usage: {} as never });
    const ok = await grade(req("/api/eiken/writing/grade", { questionId: "ai-1", question: "Do you think schools should start later?", essay: ESSAY }));
    expect(ok.status).toBe(200);
  });

  it("利用上限を超えたら429", async () => {
    vi.mocked(claude.gradeEssay).mockResolvedValue({ result: okResult, usage: {} as never });
    const ip = "10.9.9.9";
    for (let i = 0; i < DAILY_LIMIT_PER_CLIENT; i++) {
      const r = await grade(req("/api/eiken/writing/grade", { questionId: "op-01", essay: `${ESSAY} ${i}` }, ip));
      expect(r.status).toBe(200);
    }
    const res = await grade(req("/api/eiken/writing/grade", { questionId: "op-01", essay: `${ESSAY} last` }, ip));
    expect(res.status).toBe(429);
  });

  it("不正なAI応答は502", async () => {
    vi.mocked(claude.gradeEssay).mockRejectedValue(new claude.AiBadResponseError("bad"));
    const res = await grade(req("/api/eiken/writing/grade", { questionId: "op-01", essay: ESSAY + " bad" }));
    expect(res.status).toBe(502);
  });

  it("APIキー未設定は503", async () => {
    vi.mocked(claude.gradeEssay).mockRejectedValue(new claude.AiUnavailableError("no key"));
    const res = await grade(req("/api/eiken/writing/grade", { questionId: "op-01", essay: ESSAY + " nokey" }));
    expect(res.status).toBe(503);
  });

  it("採点中の同じ英文の連続送信は409", async () => {
    let release!: () => void;
    vi.mocked(claude.gradeEssay).mockImplementation(() => new Promise((r) => { release = () => r({ result: okResult, usage: {} as never }); }));
    const body = { questionId: "op-01", essay: ESSAY + " double" };
    const first = grade(req("/api/eiken/writing/grade", body));
    await new Promise((r) => setTimeout(r, 10));
    const second = await grade(req("/api/eiken/writing/grade", body));
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });
});

describe("POST /api/eiken/writing/generate", () => {
  it("生成に失敗したら固定問題にフォールバックする合図を返す", async () => {
    vi.mocked(claude.generateQuestion).mockResolvedValue({ question: null, problems: ["model answer 30 words"] });
    const res = await generate(req("/api/eiken/writing/generate", { focus: "tense", seenIds: [] }));
    const json = await res.json();
    expect(json.question).toBeNull();
    expect(json.fallback).toBe(true);
  });

  it("生成した問題はキャッシュされ、まだ見ていない人には回数を使わずに返す", async () => {
    const q = { ...WRITING_QUESTIONS[0], id: "ai-cache1", source: "ai" as const };
    vi.mocked(claude.generateQuestion).mockResolvedValue({ question: q, problems: [] });
    const first = await (await generate(req("/api/eiken/writing/generate", { focus: "plural", seenIds: [] }))).json();
    expect(first.question.id).toBe("ai-cache1");
    expect(first.cached).toBe(false);
    const second = await (await generate(req("/api/eiken/writing/generate", { focus: "plural", seenIds: [] }))).json();
    expect(second.cached).toBe(true);
    expect(claude.generateQuestion).toHaveBeenCalledTimes(1);
  });
});
