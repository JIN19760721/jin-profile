// 単語DBを使った難易度チェック（AI生成問題の模範解答が難しすぎないか）

import path from "path";
import fs from "fs";

const DB_PATH = path.resolve(process.cwd(), "data", "vocabulary.db");
// 準2級の範囲とみなすレベル
const EASY_LEVELS = ["中学", "高校", "TOEIC600"];

let easy: Set<string> | null = null;

function loadEasy(): Set<string> {
  if (easy) return easy;
  easy = new Set();
  if (!fs.existsSync(DB_PATH)) return easy;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(
      `SELECT word FROM words WHERE level IN (${EASY_LEVELS.map(() => "?").join(",")})`,
    ).all(...EASY_LEVELS) as { word: string }[];
    db.close();
    rows.forEach((r) => easy!.add(r.word.toLowerCase()));
  } catch {
    // DBが読めないときはチェックしない
  }
  return easy;
}

function candidates(w: string): string[] {
  const s = w.toLowerCase().replace(/'s$/, "");
  const out = [s];
  if (s.endsWith("ies")) out.push(s.slice(0, -3) + "y");
  if (s.endsWith("es"))  out.push(s.slice(0, -2));
  if (s.endsWith("s"))   out.push(s.slice(0, -1));
  if (s.endsWith("ed"))  out.push(s.slice(0, -2), s.slice(0, -1));
  if (s.endsWith("ing")) out.push(s.slice(0, -3), s.slice(0, -3) + "e");
  if (s.endsWith("ly"))  out.push(s.slice(0, -2));
  if (s.endsWith("er"))  out.push(s.slice(0, -2), s.slice(0, -1));
  return out;
}

export function isHardWord(w: string): boolean {
  const set = loadEasy();
  if (set.size === 0) return false;
  if (w.length <= 3) return false;
  return !candidates(w).some((c) => set.has(c));
}
