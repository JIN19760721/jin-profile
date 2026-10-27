// 英作文の文字列処理（クライアント・サーバー共通）

export const OPINION_MIN_WORDS = 50;
export const OPINION_MAX_WORDS = 60;
/** 入力できる最大文字数（APIに送るトークン数の上限も兼ねる） */
export const MAX_ESSAY_CHARS = 800;

/** 英検の語数の数え方に近い単語数（記号だけの塊は数えない。I'm などは1語） */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** 採点結果の再利用キーを作るための正規化（空白の違いだけなら同じ答案とみなす） */
export function normalizeEssay(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export type WordCountStatus = "short" | "ok" | "long";

export function wordCountStatus(n: number, min = OPINION_MIN_WORDS, max = OPINION_MAX_WORDS): WordCountStatus {
  if (n < min) return "short";
  if (n > max) return "long";
  return "ok";
}

/** 英文として送ってよい文字だけか（日本語などが混ざっていないか） */
export function hasNonEnglish(text: string): boolean {
  return /[^\x00-\x7F‘’“”]/.test(text);
}

/** 日付（端末のローカル時刻）を YYYY-MM-DD で返す */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
