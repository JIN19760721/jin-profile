// Redis に接続できないとき、AI採点は呼ばずに503で止める
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("Redis に接続できないとき", () => {
  it("採点APIは503を返し、Claude APIを呼ばない", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "http://127.0.0.1:9");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "dummy");
    const gradeEssay = vi.fn();
    vi.doMock("../../app/lib/eiken/server/claude", async (orig) => ({
      ...(await orig<typeof import("../../app/lib/eiken/server/claude")>()), gradeEssay,
    }));
    const { POST } = await import("../../app/api/eiken/writing/grade/route");
    const res = await POST(new NextRequest("http://localhost/api/eiken/writing/grade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: "op-01", essay: "I think students should not use smartphones at school because they play games." }),
    }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/利用回数を確認できない/);
    expect(gradeEssay).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
