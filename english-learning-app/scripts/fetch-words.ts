/**
 * 英語頻度単語リスト取得スクリプト
 *
 * ソース1: hermitdave/FrequencyWords (OpenSubtitles2018)
 *   URL    : https://github.com/hermitdave/FrequencyWords
 *   ライセンス: CC BY 4.0
 *
 * ソース2: Merriam-Webster / Free Dictionary API で品詞補完
 *
 * 頻度順位 → レベル対応
 *   rank   1-1200  → 中学
 *   rank 1201-3000  → 高校
 *   rank 3001-5500  → TOEIC600
 *   rank 5501-9000  → TOEIC730
 *   rank 9001-12000 → TOEIC860
 */
import Database from "better-sqlite3";
import fs   from "fs";
import path from "path";
import { getDb, setupSchema } from "./db.js";

const SOURCE = {
  name:        "OpenSubtitles2018 English Frequency List",
  short_name:  "OSUBS",
  url:         "https://github.com/hermitdave/FrequencyWords",
  license:     "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
};

const MAX_RANK   = 12000; // 取得する最大単語数
const CACHE_FILE = path.resolve(process.cwd(), "data", "en_frequency.txt");

const DOWNLOAD_URLS = [
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt",
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/refs/heads/master/content/2018/en/en_50k.txt",
];

// 学習用に適したフィルタ（純粋な英単語のみ）
const VALID_WORD = /^[a-z]{2,20}$/;

// 品詞なし・頻度が高すぎる機能語は除外しない（日本語学習でも必要）
const SKIP_WORDS = new Set<string>([
  // 数字・略語になりがちなもの（フィルタで取れないもの）
]);

function rankToLevel(rank: number): "中学" | "高校" | "TOEIC600" | "TOEIC730" | "TOEIC860" {
  if (rank <= 1200) return "中学";
  if (rank <= 3000) return "高校";
  if (rank <= 5500) return "TOEIC600";
  if (rank <= 9000) return "TOEIC730";
  return "TOEIC860";
}

async function downloadFrequencyList(): Promise<string> {
  // キャッシュ確認
  if (fs.existsSync(CACHE_FILE)) {
    const stat = fs.statSync(CACHE_FILE);
    if (stat.size > 10000) {
      console.log(`   キャッシュ使用: ${CACHE_FILE} (${Math.round(stat.size / 1024)} KB)`);
      return fs.readFileSync(CACHE_FILE, "utf-8");
    }
  }

  console.log("   FrequencyWords データをダウンロード中...");
  for (const url of DOWNLOAD_URLS) {
    try {
      process.stdout.write(`   試行: ${url.substring(0, 70)}... `);
      const res = await fetch(url, {
        headers: { "User-Agent": "EnglishLearningApp/1.0 (Educational use)" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) { console.log(`HTTP ${res.status}`); continue; }

      const text = await res.text();
      if (text.length < 10000) { console.log("データが短すぎます"); continue; }

      console.log(`OK (${Math.round(text.length / 1024)} KB)`);
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, text, "utf-8");
      console.log(`   キャッシュ保存: ${CACHE_FILE}`);
      return text;
    } catch (e) {
      console.log(`失敗: ${(e as Error).message.substring(0, 50)}`);
    }
  }

  throw new Error("頻度リストのダウンロードに失敗しました。インターネット接続を確認してください。");
}

function parseWords(text: string): { word: string; rank: number; freq: number }[] {
  const results: { word: string; rank: number; freq: number }[] = [];
  const lines = text.split("\n");

  let rank = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const word = parts[0].toLowerCase();
    const freq = parseInt(parts[1]) || 0;

    if (!VALID_WORD.test(word)) continue;
    if (SKIP_WORDS.has(word)) continue;

    rank++;
    results.push({ word, rank, freq });

    if (rank >= MAX_RANK) break;
  }

  return results;
}

export async function fetchWords(db: Database.Database): Promise<void> {
  console.log("\n📥 English FrequencyWords を取得中...");

  const text  = await downloadFrequencyList();
  const words = parseWords(text);
  console.log(`   有効単語数: ${words.length}`);

  // ソース登録
  db.prepare(`
    INSERT OR IGNORE INTO sources (name, short_name, url, license, license_url, fetched_at)
    VALUES (@name, @short_name, @url, @license, @license_url, @fetched_at)
  `).run({ ...SOURCE, fetched_at: new Date().toISOString() });

  const { id: sourceId } = db
    .prepare("SELECT id FROM sources WHERE short_name = ?")
    .get(SOURCE.short_name) as { id: number };

  const insertWord = db.prepare(`
    INSERT OR IGNORE INTO words (word, frequency_rank, source_id, level)
    VALUES (@word, @rank, @sourceId, @level)
  `);

  let inserted = 0;
  let skipped  = 0;

  db.transaction(() => {
    for (const { word, rank } of words) {
      const result = insertWord.run({
        word,
        rank,
        sourceId,
        level: rankToLevel(rank),
      });
      if (result.changes > 0) inserted++;
      else skipped++;
    }
  })();

  // レベル別集計
  const counts = db.prepare(`
    SELECT level, COUNT(*) as cnt FROM words
    WHERE source_id = ?
    GROUP BY level
    ORDER BY CASE level WHEN '中学' THEN 1 WHEN '高校' THEN 2 WHEN 'TOEIC600' THEN 3 WHEN 'TOEIC730' THEN 4 ELSE 5 END
  `).all(sourceId) as { level: string; cnt: number }[];

  console.log(`   ✓ 新規登録: ${inserted} 語  スキップ(重複): ${skipped} 語`);
  for (const { level, cnt } of counts) {
    console.log(`     ${level.padEnd(10)} ${cnt} 語`);
  }
}

// 単体実行
if (process.argv[1].endsWith("fetch-words.ts") || process.argv[1].endsWith("fetch-words.js")) {
  const db = getDb();
  setupSchema(db);
  fetchWords(db)
    .then(() => { db.close(); console.log("完了"); })
    .catch((e) => { console.error("エラー:", e.message); db.close(); process.exit(1); });
}
