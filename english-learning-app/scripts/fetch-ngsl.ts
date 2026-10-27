/**
 * NGSL (New General Service List 1.01) 取得スクリプト
 * ライセンス: CC BY 4.0  https://creativecommons.org/licenses/by/4.0/
 * 著者: Browne, Culligan & Phillips (2013)
 *
 * 手動ダウンロード場所 → data/NGSL.xlsx:
 *   https://www.newgeneralservicelist.org/
 *   ページ上の "Downloads" からExcelファイルを入手してください
 */
import * as XLSX from "xlsx";
import Database from "better-sqlite3";
import fs   from "fs";
import path from "path";
import { getDb, setupSchema } from "./db.js";

const SOURCE = {
  name:        "New General Service List 1.01",
  short_name:  "NGSL",
  url:         "https://www.newgeneralservicelist.org/",
  license:     "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
};

const DOWNLOAD_URLS = [
  // Wayback Machine 経由（元URLが変更された場合のバックアップ）
  "https://web.archive.org/web/2024/https://www.newgeneralservicelist.org/s/NGSL-101-by-band-r1_0.xlsx",
  "https://web.archive.org/web/2023/https://www.newgeneralservicelist.org/s/NGSL-101-by-band-r1_0.xlsx",
  // 直接URL候補
  "https://www.newgeneralservicelist.org/s/NGSL-101-by-band-r1_0.xlsx",
  "https://www.newgeneralservicelist.org/s/NGSL-101-r1-1.xlsx",
];

const LOCAL_FILES = [
  path.resolve(process.cwd(), "data", "NGSL.xlsx"),
  path.resolve(process.cwd(), "data", "NGSL.csv"),
  path.resolve(process.cwd(), "data", "ngsl.xlsx"),
  path.resolve(process.cwd(), "data", "ngsl.csv"),
];

function bandToLevel(band: number): string {
  if (band <= 1) return "中学";
  if (band <= 2) return "高校";
  if (band <= 3) return "TOEIC600";
  if (band <= 4) return "TOEIC730";
  return "TOEIC860";
}

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
  // 1. ローカルファイル優先
  for (const filePath of LOCAL_FILES) {
    if (fs.existsSync(filePath)) {
      console.log(`   ローカルファイル使用: ${path.basename(filePath)}`);
      return XLSX.readFile(filePath);
    }
  }

  // 2. URLからダウンロード試行
  console.log("   ローカルファイルが見つかりません。ダウンロードを試みます...");
  for (const url of DOWNLOAD_URLS) {
    try {
      process.stdout.write(`   試行: ${url.substring(0, 70)}... `);
      const res = await fetch(url, {
        headers: { "User-Agent": "EnglishLearningApp/1.0 (Educational use)" },
        signal:  AbortSignal.timeout(20000),
      });
      if (!res.ok) { console.log(`HTTP ${res.status}`); continue; }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 1000) { console.log("ファイルサイズ不正"); continue; }

      console.log(`OK (${Math.round(buffer.byteLength / 1024)} KB)`);
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });

      // キャッシュ保存
      const savePath = LOCAL_FILES[0];
      fs.mkdirSync(path.dirname(savePath), { recursive: true });
      fs.writeFileSync(savePath, Buffer.from(buffer));
      console.log(`   キャッシュ保存: ${savePath}`);
      return wb;
    } catch (e) {
      console.log(`失敗 (${(e as Error).message.substring(0, 40)})`);
    }
  }

  throw new Error(
    "NGSL のダウンロードに失敗しました。\n\n" +
    "  ★ 手動でダウンロードして保存してください:\n" +
    "    保存先: data/NGSL.xlsx\n\n" +
    "  ダウンロード元:\n" +
    "    https://www.newgeneralservicelist.org/ → Downloads ページ\n\n" +
    "  ※ ダウンロード後に再度 npm run db:ngsl を実行してください"
  );
}

export async function fetchNGSL(db: Database.Database): Promise<void> {
  console.log("\n📥 NGSL を読み込み中...");

  const workbook  = await loadWorkbook();
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "" }
  );

  db.prepare(`
    INSERT OR IGNORE INTO sources (name, short_name, url, license, license_url, fetched_at)
    VALUES (@name, @short_name, @url, @license, @license_url, @fetched_at)
  `).run({ ...SOURCE, fetched_at: new Date().toISOString() });

  const { id: sourceId } = db
    .prepare("SELECT id FROM sources WHERE short_name = ?")
    .get(SOURCE.short_name) as { id: number };

  const insertWord = db.prepare(`
    INSERT OR IGNORE INTO words (word, pos, frequency_rank, band, source_id, level)
    VALUES (@word, @pos, @rank, @band, @sourceId, @level)
  `);

  let inserted = 0;
  let skipped  = 0;

  db.transaction(() => {
    for (const row of rows) {
      const word = String(findCol(row, ["lemma", "word", "headword", "form"]) ?? "").trim().toLowerCase();
      if (!word || word.length < 2 || /^\d/.test(word)) continue;

      const band = parseInt(String(findCol(row, ["band", "group", "frequencyband"]) ?? "0"));
      if (isNaN(band) || band < 1) continue;

      const rankRaw = findCol(row, ["rank", "no", "order", "frequencyrank"]);
      const rank    = parseInt(String(rankRaw ?? ""));
      const pos     = String(findCol(row, ["pos", "partofspeech", "type", "class"]) ?? "").trim();

      const result = insertWord.run({
        word, pos: pos || null,
        rank: isNaN(rank) ? null : rank,
        band, sourceId,
        level: bandToLevel(band),
      });
      if (result.changes > 0) inserted++;
      else skipped++;
    }
  })();

  console.log(`   ✓ 新規登録: ${inserted} 語  スキップ(重複): ${skipped} 語`);
}

if (process.argv[1].includes("fetch-ngsl")) {
  const db = getDb();
  setupSchema(db);
  fetchNGSL(db)
    .then(() => { db.close(); console.log("完了"); })
    .catch((e) => { console.error("\nエラー:", e.message); db.close(); process.exit(1); });
}
