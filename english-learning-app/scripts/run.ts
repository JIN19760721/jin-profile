/**
 * データパイプライン メインスクリプト
 *
 * 使い方:
 *   npm run db:words           - 英語頻度リスト (~12000語) をDBへ登録
 *   npm run db:tatoeba         - Tatoeba例文を取得（デフォルト1000語分）
 *   npm run db:ai              - Claude AIで日本語訳・カタカナを補完
 *   npm run db:build           - words + tatoeba + ai を一括実行
 *   npm run db:status          - DB統計を表示
 *   npm run db:seed            - アプリ組み込み60語をシード（開発用）
 *
 * オプション:
 *   --limit=N                  - 処理語数の上限（tatoeba/ai のみ有効）
 *   --level=中学               - 特定レベルのみ処理（tatoeba/ai のみ有効）
 */
import { getDb, setupSchema } from "./db.js";
import { fetchWords }   from "./fetch-words.js";
import { fetchNGSL }    from "./fetch-ngsl.js";
import { fetchBSL }     from "./fetch-bsl.js";
import { fetchTatoeba } from "./fetch-tatoeba.js";
import { aiEnhance }    from "./ai-enhance.js";
import { seedFromApp }  from "./seed-from-app.js";
import fs   from "fs";
import path from "path";

// .env.local を読み込む
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

function parseArgs() {
  const args    = process.argv.slice(2);
  const command = args[0] ?? "status";
  const limit   = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const level   = args.find((a) => a.startsWith("--level="))?.split("=")[1];
  return { command, limit: limit ? parseInt(limit) : undefined, level };
}

function showStatus(db: ReturnType<typeof getDb>) {
  console.log("\n📊 DB 統計\n" + "─".repeat(50));

  const sources = db.prepare(
    "SELECT name, short_name, license, fetched_at FROM sources ORDER BY id"
  ).all() as { name: string; short_name: string; license: string; fetched_at: string }[];

  if (sources.length === 0) {
    console.log("  まだデータがありません。npm run db:build を実行してください。");
    return;
  }

  console.log("\nデータソース:");
  for (const s of sources) {
    console.log(`  [${s.short_name}] ${s.name}`);
    console.log(`          ライセンス: ${s.license}  取得: ${s.fetched_at?.split("T")[0] ?? "未取得"}`);
  }

  const total  = (db.prepare("SELECT COUNT(*) as n FROM words").get() as { n: number }).n;
  const aiDone = (db.prepare("SELECT COUNT(*) as n FROM words WHERE ai_enhanced=1").get() as { n: number }).n;
  const withJp = (db.prepare("SELECT COUNT(*) as n FROM words WHERE japanese IS NOT NULL").get() as { n: number }).n;
  const exCnt  = (db.prepare("SELECT COUNT(*) as n FROM examples").get() as { n: number }).n;
  const beCnt  = (db.prepare("SELECT COUNT(*) as n FROM beginner_examples").get() as { n: number }).n;

  const levels = db.prepare(`
    SELECT level, COUNT(*) as total,
           SUM(CASE WHEN japanese IS NOT NULL THEN 1 ELSE 0 END) as translated
    FROM words GROUP BY level
    ORDER BY CASE level WHEN '中学' THEN 1 WHEN '高校' THEN 2 WHEN 'TOEIC600' THEN 3 WHEN 'TOEIC730' THEN 4 ELSE 5 END
  `).all() as { level: string; total: number; translated: number }[];

  console.log(`\n単語数: ${total} 語  (日本語訳あり: ${withJp} 語 / AI補完済: ${aiDone} 語)`);
  console.log("\nレベル別:");
  for (const { level, total: cnt, translated } of levels) {
    const pct = cnt > 0 ? Math.round(translated / cnt * 100) : 0;
    const bar = "█".repeat(Math.round(cnt / 200));
    console.log(`  ${level.padEnd(10)} ${String(cnt).padStart(6)} 語  訳あり: ${pct}%  ${bar}`);
  }

  console.log(`\nTatoeba例文:   ${exCnt} 件`);
  console.log(`AI初心者例文:  ${beCnt} 件`);
  console.log("─".repeat(50));

  if (withJp === 0) {
    console.log("\n⚠️  まだ日本語訳がありません。npm run db:ai を実行してください。");
  } else if (withJp < total) {
    console.log(`\n💡 残り ${total - withJp} 語が未翻訳。npm run db:ai で補完できます。`);
  }
}

async function main() {
  const { command, limit, level } = parseArgs();
  const db = getDb();

  console.log("🗄️  英会話DB データパイプライン");
  console.log(`   コマンド: ${command}${limit !== undefined ? `  limit=${limit}` : ""}${level ? `  level=${level}` : ""}`);

  setupSchema(db);

  try {
    switch (command) {

      // ─── メインソース: 頻度リスト（推奨） ───────────────────────────
      case "words":
        await fetchWords(db);
        break;

      // ─── オプション: NGSL（ローカルファイルがある場合） ─────────────
      case "ngsl":
        await fetchNGSL(db);
        break;

      // ─── オプション: BSL（ローカルファイルがある場合） ──────────────
      case "bsl":
        await fetchBSL(db);
        break;

      // ─── Tatoeba例文取得 ─────────────────────────────────────────
      case "tatoeba":
        await fetchTatoeba(db, { limit: limit ?? 1000, level });
        break;

      // ─── AI補完 ──────────────────────────────────────────────────
      case "ai":
        await aiEnhance(db, { limit, level });
        break;

      // ─── DB統計 ──────────────────────────────────────────────────
      case "status":
        showStatus(db);
        break;

      // ─── 開発用シード（60語） ─────────────────────────────────────
      case "seed":
        seedFromApp(db);
        break;

      // ─── 一括ビルド ──────────────────────────────────────────────
      case "build":
      case "all": {
        const tatoebaLimit = limit ?? 1000;
        console.log("\n全ステップを順番に実行します");
        console.log(`  Tatoeba: ${tatoebaLimit} 語分  AI補完: 全語`);
        console.log("─".repeat(50));

        console.log("\nSTEP 1/4: 英語頻度単語リスト (FrequencyWords)");
        await fetchWords(db);

        // NGSL/BSL はローカルファイルがある場合のみ追加登録
        const ngslFile = path.resolve(process.cwd(), "data", "NGSL.xlsx");
        const bslFile  = path.resolve(process.cwd(), "data", "BSL.xlsx");
        if (fs.existsSync(ngslFile)) {
          console.log("\nSTEP 1b: NGSL（ローカルファイル検出）");
          try { await fetchNGSL(db); } catch (e) { console.log(`  スキップ: ${(e as Error).message.split("\n")[0]}`); }
        }
        if (fs.existsSync(bslFile)) {
          console.log("\nSTEP 1c: BSL（ローカルファイル検出）");
          try { await fetchBSL(db); }  catch (e) { console.log(`  スキップ: ${(e as Error).message.split("\n")[0]}`); }
        }

        console.log(`\nSTEP 2/4: Tatoeba例文 (上位${tatoebaLimit}語)`);
        await fetchTatoeba(db, { limit: tatoebaLimit });

        console.log("\nSTEP 3/4: AI補完（日本語訳・カタカナ・例文）");
        await aiEnhance(db, {});

        console.log("\nSTEP 4/4: アプリシード（60語の確認）");
        seedFromApp(db);

        showStatus(db);
        break;
      }

      default:
        console.error(`不明なコマンド: ${command}`);
        console.log("使用可能: words / ngsl / bsl / tatoeba / ai / build / status / seed");
        process.exit(1);
    }
  } catch (e) {
    console.error("\n❌ エラー:", (e as Error).message);
    db.close();
    process.exit(1);
  }

  db.close();
  console.log("\n✅ 処理完了");
}

main();
