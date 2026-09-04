/**
 * BSL (Business Service List) 取得スクリプト
 * ライセンス: CC BY 4.0  https://creativecommons.org/licenses/by/4.0/
 * 著者: Browne & Culligan (2016)
 * NGSLに含まれないビジネス特化語彙 約1700語
 *
 * ダウンロード元:
 *   https://www.newgeneralservicelist.org/business-service-list
 *   → data/BSL.xlsx に保存してください
 */
import * as XLSX from "xlsx";
import Database from "better-sqlite3";
import fs   from "fs";
import path from "path";
import { getDb, setupSchema } from "./db.js";

const SOURCE = {
  name:        "Business Service List (BSL)",
  short_name:  "BSL",
  url:         "https://www.newgeneralservicelist.org/business-service-list",
  license:     "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
};

const DOWNLOAD_URLS = [
  "https://www.newgeneralservicelist.org/s/BSL-English-Wordlist-r1-4.xlsx",
  "https://www.newgeneralservicelist.org/s/BSL-English-Wordlist.xlsx",
  "https://www.newgeneralservicelist.org/s/BSL-r1-4.xlsx",
];

const LOCAL_FILES = [
  path.resolve(process.cwd(), "data", "BSL.xlsx"),
  path.resolve(process.cwd(), "data", "BSL.csv"),
  path.resolve(process.cwd(), "data", "bsl.xlsx"),
  path.resolve(process.cwd(), "data", "bsl.csv"),
];

function findCol(row: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const key = keys.find((k) =>
      k.toLowerCase().replace(/[\s_-]/g, "").includes(c.toLowerCase().replace(/[\s_-]/g, ""))
    );
    if (key !== undefined && row[key] !== "" && row[key] !== undefined) return row[key];
  }
  return undefined;
}

async function loadWorkbook(): Promise<XLSX.WorkBook> {
  for (const filePath of LOCAL_FILES) {
    if (fs.existsSync(filePath)) {
      console.log(`   ローカルファイル使用: ${path.basename(filePath)}`);
      return XLSX.readFile(filePath);
    }
  }

  console.log("   ローカルファイルが見つかりません。ダウンロードを試みます...");
  for (const url of DOWNLOAD_URLS) {
    try {
      console.log(`   試行: ${url}`);
      const res = await fetch(url, {
        headers: { "User-Agent": "EnglishLearningApp/1.0 (Educational use)" },
        signal:  AbortSignal.timeout(15000),
      });
      if (!res.ok) { console.log(`   → HTTP ${res.status}`); continue; }

      const buffer = await res.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      console.log(`   → 成功`);

      const savePath = path.resolve(process.cwd(), "data", "BSL.xlsx");
      fs.mkdirSync(path.dirname(savePath), { recursive: true });
      fs.writeFileSync(savePath, Buffer.from(buffer));
      console.log(`   キャッシュ保存: ${savePath}`);
      return wb;
    } catch (_) {
      console.log(`   → 失敗`);
    }
  }

  throw new Error(
    "BSLのダウンロードに失敗しました。\n\n" +
    "  手動でダウンロードして以下に保存してください:\n" +
    "    data/BSL.xlsx\n\n" +
    "  ダウンロード元:\n" +
    "    https://www.newgeneralservicelist.org/business-service-list\n"
  );
}

export async function fetchBSL(db: Database.Database): Promise<void> {
  console.log("\n📥 BSL を読み込み中...");

  const workbook  = await loadWorkbook();
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "" }
  );

  db.prepare(`
    INSERT OR REPLACE INTO sources (name, short_name, url, license, license_url, fetched_at)
    VALUES (@name, @short_name, @url, @license, @license_url, @fetched_at)
  `).run({ ...SOURCE, fetched_at: new Date().toISOString() });

  const { id: sourceId } = db
    .prepare("SELECT id FROM sources WHERE short_name = ?")
    .get(SOURCE.short_name) as { id: number };

  const insertWord = db.prepare(`
    INSERT OR IGNORE INTO words (word, pos, frequency_rank, source_id, level)
    VALUES (@word, @pos, @rank, @sourceId, @level)
  `);

  let inserted = 0;
  let skipped  = 0;
  let autoRank = 1;
  const total  = rows.length;

  db.transaction(() => {
    for (const row of rows) {
      const word = String(findCol(row, ["lemma", "word", "headword", "form"]) ?? "").trim().toLowerCase();
      if (!word || word.length < 2 || /^\d/.test(word)) continue;

      const rankRaw     = findCol(row, ["rank", "no", "order", "frequencyrank"]);
      const rank        = parseInt(String(rankRaw ?? ""));
      const effectRank  = isNaN(rank) ? autoRank++ : rank;
      const pos         = String(findCol(row, ["pos", "partofspeech", "type", "class"]) ?? "").trim();
      const level       = effectRank <= total / 2 ? "TOEIC730" : "TOEIC860";

      const result = insertWord.run({ word, pos: pos || null, rank: effectRank, sourceId, level });
      if (result.changes > 0) inserted++;
      else skipped++;
    }
  })();

  console.log(`   ✓ 新規登録: ${inserted} 語  スキップ(重複): ${skipped} 語`);
}

if (process.argv[1].includes("fetch-bsl")) {
  const db = getDb();
  setupSchema(db);
  fetchBSL(db)
    .then(() => { db.close(); console.log("完了"); })
    .catch((e) => { console.error("エラー:", e.message); db.close(); process.exit(1); });
}
