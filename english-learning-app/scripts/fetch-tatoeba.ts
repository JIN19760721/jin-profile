/**
 * Tatoeba 英日例文 取得スクリプト
 * ライセンス: CC BY 2.0  https://creativecommons.org/licenses/by/2.0/
 * API: https://tatoeba.org/en/api_v0/search
 *
 * DBに登録済みの単語についてTatoeba APIから英日ペアを取得して保存します。
 * レート制限のため1単語/秒で処理します（大量の場合は時間がかかります）。
 */
import Database from "better-sqlite3";
import { getDb, setupSchema } from "./db.js";

const SOURCE = {
  name:        "Tatoeba",
  short_name:  "TATOEBA",
  url:         "https://tatoeba.org",
  license:     "CC BY 2.0",
  license_url: "https://creativecommons.org/licenses/by/2.0/",
};

const API_BASE    = "https://tatoeba.org/en/api_v0/search";
const RESULTS_PER = 3;    // 1単語あたり最大取得件数
const DELAY_MS    = 1100; // APIレート制限対策（約1リクエスト/秒）

interface TatoebaResult {
  id:           number;
  text:         string;
  translations: { id: number; lang: string; text: string }[][];
}

async function fetchSentences(word: string): Promise<TatoebaResult[]> {
  const url = `${API_BASE}?from=eng&to=jpn&query=${encodeURIComponent(word)}&limit=${RESULTS_PER}`;
  const res  = await fetch(url, {
    headers: { "User-Agent": "EnglishLearningApp/1.0 (Educational use)" },
  });
  if (!res.ok) return [];

  const data = await res.json() as { results?: TatoebaResult[] };
  return data.results ?? [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTatoeba(
  db: Database.Database,
  opts: { limit?: number; level?: string } = {}
): Promise<void> {
  console.log("\n📥 Tatoeba 例文を取得中...");

  // ソース登録
  db.prepare(`
    INSERT OR IGNORE INTO sources (name, short_name, url, license, license_url, fetched_at)
    VALUES (@name, @short_name, @url, @license, @license_url, @fetched_at)
  `).run({ ...SOURCE, fetched_at: new Date().toISOString() });

  const { id: sourceId } = db
    .prepare("SELECT id FROM sources WHERE short_name = ?")
    .get(SOURCE.short_name) as { id: number };

  // まだTatoeba例文のない単語を取得
  let query = `
    SELECT w.id, w.word, w.level FROM words w
    WHERE NOT EXISTS (
      SELECT 1 FROM word_examples we
      JOIN examples e ON we.example_id = e.id
      WHERE we.word_id = w.id AND e.source_id = ?
    )
  `;
  const params: unknown[] = [sourceId];

  if (opts.level) {
    query += " AND w.level = ?";
    params.push(opts.level);
  }
  query += " ORDER BY w.frequency_rank ASC NULLS LAST";
  if (opts.limit) {
    query += " LIMIT ?";
    params.push(opts.limit);
  }

  const words = db.prepare(query).all(...params) as { id: number; word: string; level: string }[];
  console.log(`   対象: ${words.length} 語`);

  const insertExample  = db.prepare(`
    INSERT OR IGNORE INTO examples (english, japanese, source_id, tatoeba_id, difficulty)
    VALUES (@english, @japanese, @sourceId, @tatoebaId, @difficulty)
  `);
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO word_examples (word_id, example_id) VALUES (?, ?)
  `);
  const getExample = db.prepare("SELECT id FROM examples WHERE english = ?");

  let totalExamples = 0;
  let wordsDone     = 0;

  for (const { id: wordId, word, level } of words) {
    const results = await fetchSentences(word);

    if (results.length > 0) {
      db.transaction(() => {
        for (const r of results) {
          const jpList = r.translations.flat().filter((t) => t.lang === "jpn");
          if (jpList.length === 0) continue;

          const difficulty =
            level === "中学"     ? "beginner" :
            level === "高校"     ? "beginner" :
            level === "TOEIC600" ? "intermediate" : "advanced";

          insertExample.run({
            english:   r.text,
            japanese:  jpList[0].text,
            sourceId,
            tatoebaId: r.id,
            difficulty,
          });

          const row = getExample.get(r.text) as { id: number } | undefined;
          if (row) {
            insertLink.run(wordId, row.id);
            totalExamples++;
          }
        }
      })();
    }

    wordsDone++;
    if (wordsDone % 50 === 0) {
      console.log(`   進捗: ${wordsDone}/${words.length} 語  例文累計: ${totalExamples}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`   ✓ 例文登録完了: ${totalExamples} 件 (${wordsDone} 語処理)`);
}

// 単体実行時
if (process.argv[1].endsWith("fetch-tatoeba.ts") || process.argv[1].endsWith("fetch-tatoeba.js")) {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const levelArg = process.argv.find((a) => a.startsWith("--level="));
  const limit    = limitArg ? parseInt(limitArg.split("=")[1]) : 100;
  const level    = levelArg ? levelArg.split("=")[1] : undefined;

  const db = getDb();
  setupSchema(db);
  console.log(`オプション: limit=${limit}${level ? ` level=${level}` : ""}`);
  fetchTatoeba(db, { limit, level })
    .then(() => { db.close(); console.log("完了"); })
    .catch((e) => { console.error("エラー:", e.message); db.close(); process.exit(1); });
}
