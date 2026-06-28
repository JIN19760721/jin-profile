import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.resolve(process.cwd(), "data", "vocabulary.db");

export function getDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function setupSchema(db: Database.Database): void {
  db.exec(`
    -- データソース・ライセンス情報
    CREATE TABLE IF NOT EXISTS sources (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      short_name  TEXT    NOT NULL UNIQUE,
      url         TEXT    NOT NULL,
      license     TEXT    NOT NULL,
      license_url TEXT,
      fetched_at  TEXT
    );

    -- 単語テーブル
    CREATE TABLE IF NOT EXISTS words (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      word           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      pos            TEXT,                   -- 品詞 (noun/verb/adjective/adverb)
      frequency_rank INTEGER,                -- 頻度順位（小さいほど高頻度）
      band           INTEGER,                -- NGSLバンド番号
      source_id      INTEGER REFERENCES sources(id),
      level          TEXT    CHECK(level IN ('中学','高校','TOEIC600','TOEIC730','TOEIC860')),
      japanese       TEXT,                   -- 日本語訳
      katakana       TEXT,                   -- カタカナ発音
      ai_enhanced    INTEGER DEFAULT 0,      -- AI補完済みフラグ
      created_at     TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_words_level      ON words(level);
    CREATE INDEX IF NOT EXISTS idx_words_band       ON words(band);
    CREATE INDEX IF NOT EXISTS idx_words_ai         ON words(ai_enhanced);
    CREATE INDEX IF NOT EXISTS idx_words_source     ON words(source_id);

    -- 熟語・フレーズテーブル
    CREATE TABLE IF NOT EXISTS phrases (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phrase      TEXT    NOT NULL UNIQUE,
      source_id   INTEGER REFERENCES sources(id),
      level       TEXT    CHECK(level IN ('中学','高校','TOEIC600','TOEIC730','TOEIC860')),
      japanese    TEXT,
      situation   TEXT,
      tips        TEXT,
      ai_enhanced INTEGER DEFAULT 0,
      created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    -- 例文テーブル（Tatoeba・AI生成）
    CREATE TABLE IF NOT EXISTS examples (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      english     TEXT    NOT NULL UNIQUE,
      japanese    TEXT,
      source_id   INTEGER REFERENCES sources(id),
      tatoeba_id  INTEGER,
      difficulty  TEXT    CHECK(difficulty IN ('beginner','intermediate','advanced')),
      created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    -- 単語↔例文 多対多
    CREATE TABLE IF NOT EXISTS word_examples (
      word_id    INTEGER NOT NULL REFERENCES words(id)    ON DELETE CASCADE,
      example_id INTEGER NOT NULL REFERENCES examples(id) ON DELETE CASCADE,
      PRIMARY KEY (word_id, example_id)
    );

    -- AI生成の初心者向け例文（単語ごと1件）
    CREATE TABLE IF NOT EXISTS beginner_examples (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id    INTEGER NOT NULL UNIQUE REFERENCES words(id) ON DELETE CASCADE,
      english    TEXT    NOT NULL,
      japanese   TEXT    NOT NULL,
      created_at TEXT    DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
