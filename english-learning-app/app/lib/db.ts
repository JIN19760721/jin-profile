import path from "path";
import fs   from "fs";
import type { Word, Phrase } from "../data/vocabulary";

const DB_PATH = path.resolve(process.cwd(), "data", "vocabulary.db");

function openDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  return new Database(DB_PATH, { readonly: true }) as import("better-sqlite3").Database;
}

export function dbExists(): boolean {
  if (!fs.existsSync(DB_PATH)) return false;
  try {
    const db = openDb();
    const row = db.prepare("SELECT COUNT(*) as n FROM words WHERE japanese IS NOT NULL").get() as { n: number };
    db.close();
    return row.n > 0;
  } catch {
    return false;
  }
}

export function getVocabulary(): Word[] {
  const db = openDb();
  try {
    return db.prepare(`
      SELECT
        w.id,
        w.word                          AS english,
        COALESCE(w.japanese,  '')       AS japanese,
        COALESCE(w.katakana,  '')       AS katakana,
        COALESCE(w.pos,       '名詞')   AS category,
        w.level,
        COALESCE(be.english,  '')       AS example,
        COALESCE(be.japanese, '')       AS exampleJp
      FROM words w
      LEFT JOIN beginner_examples be ON be.word_id = w.id
      WHERE w.japanese IS NOT NULL
      ORDER BY w.frequency_rank ASC NULLS LAST, w.id ASC
    `).all() as Word[];
  } finally {
    db.close();
  }
}

export function getPhrases(): Phrase[] {
  const db = openDb();
  try {
    const rows = db.prepare(`
      SELECT
        id,
        phrase                    AS english,
        COALESCE(japanese, '')    AS japanese,
        COALESCE(situation, '')   AS situation,
        tips
      FROM phrases
      WHERE japanese IS NOT NULL
      ORDER BY id ASC
    `).all() as Phrase[];
    return rows;
  } finally {
    db.close();
  }
}
