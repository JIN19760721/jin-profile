// AI機能の利用制限・二重送信防止・生成問題キャッシュ（サーバー専用）
// Upstash Redis を使う。開発環境で Redis が未設定のときだけメモリで代用する。
// 英作文の本文は保存しない（IPアドレスもハッシュ化して扱う）。

import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import type { WritingQuestion, WeaknessTag } from "../types";

export const DAILY_LIMIT_PER_CLIENT = Number(process.env.EIKEN_AI_DAILY_LIMIT ?? 10);
export const DAILY_LIMIT_GLOBAL     = Number(process.env.EIKEN_AI_DAILY_GLOBAL ?? 50);
const GEN_CACHE_MAX = 30;
const DAY_SEC = 60 * 60 * 48;

export class LimitUnavailableError extends Error {}

interface KV {
  incr(key: string, ttlSec: number): Promise<number>;
  decr(key: string): Promise<void>;
  setNx(key: string, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
  getList(key: string): Promise<string[]>;
  pushList(key: string, value: string, max: number): Promise<void>;
}

function redisKV(redis: Redis): KV {
  return {
    async incr(key, ttl) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttl);
      return n;
    },
    async decr(key) { await redis.decr(key); },
    async setNx(key, ttl) { return (await redis.set(key, "1", { nx: true, ex: ttl })) === "OK"; },
    async del(key) { await redis.del(key); },
    async getList(key) {
      const items = await redis.lrange<string>(key, 0, -1);
      return items.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
    },
    async pushList(key, value, max) {
      await redis.rpush(key, value);
      await redis.ltrim(key, -max, -1);
    },
  };
}

// 開発用のメモリ実装
const mem = new Map<string, { v: number | string[]; exp: number }>();
const memKV: KV = {
  async incr(key, ttl) {
    const now = Date.now();
    const e = mem.get(key);
    const n = e && e.exp > now ? (e.v as number) + 1 : 1;
    mem.set(key, { v: n, exp: e && e.exp > now ? e.exp : now + ttl * 1000 });
    return n;
  },
  async decr(key) {
    const e = mem.get(key);
    if (e) e.v = Math.max(0, (e.v as number) - 1);
  },
  async setNx(key, ttl) {
    const now = Date.now();
    const e = mem.get(key);
    if (e && e.exp > now) return false;
    mem.set(key, { v: 1, exp: now + ttl * 1000 });
    return true;
  },
  async del(key) { mem.delete(key); },
  async getList(key) { return (mem.get(key)?.v as string[] | undefined) ?? []; },
  async pushList(key, value, max) {
    const cur = (mem.get(key)?.v as string[] | undefined) ?? [];
    mem.set(key, { v: [...cur, value].slice(-max), exp: Number.MAX_SAFE_INTEGER });
  },
};

let kv: KV | null = null;
function getKV(): KV {
  if (kv) return kv;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    kv = redisKV(new Redis({ url, token }));
  } else if (process.env.NODE_ENV !== "production") {
    kv = memKV;
  } else {
    // 本番で制限を数えられないときは、費用が増えないようにAI機能を止める
    throw new LimitUnavailableError("Redis is not configured");
  }
  return kv;
}

/** 日本時間の日付（利用回数は日本時間の0時にリセット） */
function jstDate(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** リクエスト元を表すID（IPアドレスをそのまま保存しないようハッシュ化） */
export function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`eiken:${ip}`).digest("hex").slice(0, 24);
}

export interface Quota { ok: boolean; used: number; limit: number; reason?: "client" | "global" }

/** 1回分の利用を記録する。上限を超えていれば ok: false（その場合は数え直さない） */
export async function consumeQuota(client: string): Promise<Quota> {
  const store = getKV();
  const day = jstDate();
  const ckey = `eiken:ai:${day}:${client}`;
  const gkey = `eiken:ai:${day}:all`;
  const used = await store.incr(ckey, DAY_SEC);
  if (used > DAILY_LIMIT_PER_CLIENT) {
    await store.decr(ckey);
    return { ok: false, used: DAILY_LIMIT_PER_CLIENT, limit: DAILY_LIMIT_PER_CLIENT, reason: "client" };
  }
  const all = await store.incr(gkey, DAY_SEC);
  if (all > DAILY_LIMIT_GLOBAL) {
    await store.decr(gkey);
    await store.decr(ckey);
    return { ok: false, used, limit: DAILY_LIMIT_PER_CLIENT, reason: "global" };
  }
  return { ok: true, used, limit: DAILY_LIMIT_PER_CLIENT };
}

/** AI呼び出しが失敗したときは利用回数を戻す */
export async function refundQuota(client: string): Promise<void> {
  const store = getKV();
  const day = jstDate();
  await store.decr(`eiken:ai:${day}:${client}`);
  await store.decr(`eiken:ai:${day}:all`);
}

/** 同じ答案の同時採点を防ぐロック（本文は保存せず、ハッシュだけをキーにする） */
export async function acquireLock(name: string, ttlSec = 90): Promise<boolean> {
  return getKV().setNx(`eiken:lock:${name}`, ttlSec);
}
export async function releaseLock(name: string): Promise<void> {
  await getKV().del(`eiken:lock:${name}`);
}

export function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/** AI生成問題のキャッシュ（個人のデータは含まない） */
export async function cachedQuestions(focus: WeaknessTag | "general"): Promise<WritingQuestion[]> {
  const items = await getKV().getList(`eiken:gen:${focus}`);
  return items.flatMap((s) => { try { return [JSON.parse(s) as WritingQuestion]; } catch { return []; } });
}
export async function cacheQuestion(focus: WeaknessTag | "general", q: WritingQuestion): Promise<void> {
  await getKV().pushList(`eiken:gen:${focus}`, JSON.stringify(q), GEN_CACHE_MAX);
}
