/**
 * AI補完スクリプト（Anthropic Claude API使用）
 * 未補完の単語に対して以下を自動生成:
 *   - 日本語訳
 *   - カタカナ発音
 *   - 初心者向け英語例文 + 日本語訳
 *
 * 必要: 環境変数 ANTHROPIC_API_KEY
 */
import Anthropic from "@anthropic-ai/sdk";
import Database  from "better-sqlite3";
import { getDb, setupSchema } from "./db.js";

const BATCH_SIZE  = 20;   // 1回のAPI呼び出しで処理する単語数
const DELAY_MS    = 500;  // バッチ間の待機時間

interface AiResult {
  word:       string;
  japanese:   string;  // 自然な日本語訳（1〜3語）
  katakana:   string;  // カタカナ発音（例: アチーブ）
  example_en: string;  // 初心者向け英語例文
  example_jp: string;  // 例文の日本語訳
}

const SYSTEM_PROMPT = `あなたは日本人英語学習者向けの教材作成AIです。
英単語リストに対して以下のJSONを返してください。必ず配列全体をJSON形式のみで返してください（説明文不要）。

各単語について:
- japanese: 最も一般的な日本語訳（1〜3語の自然な日本語）
- katakana: 英語の発音をカタカナで（例: achieve → アチーブ）
- example_en: そのレベルに適した短い英語例文（簡潔で実用的）
- example_jp: 例文の自然な日本語訳

レベル基準:
- 中学: 中学生が理解できる平易な例文
- 高校: 高校生レベルの文法・語彙
- TOEIC600: TOEIC600点相当のビジネス・日常英語
- TOEIC730: TOEIC730点相当のやや高度な表現
- TOEIC860: TOEIC860点相当の洗練された表現`;

function buildUserPrompt(words: { word: string; level: string; pos: string | null }[]): string {
  const list = words.map((w) =>
    `{"word":"${w.word}","level":"${w.level}","pos":"${w.pos ?? "unknown"}"}`
  ).join("\n");
  return `以下の単語について情報を生成してください:\n${list}\n\nJSON配列のみを返してください。`;
}

async function processWithAI(
  client: Anthropic,
  batch: { word: string; level: string; pos: string | null }[]
): Promise<AiResult[]> {
  const message = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: "user", content: buildUserPrompt(batch) }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // JSON抽出（マークダウンコードブロック対応）
  const jsonMatch = text.match(/\[[\s\S]+\]/);
  if (!jsonMatch) throw new Error(`JSONが見つかりません: ${text.substring(0, 200)}`);

  return JSON.parse(jsonMatch[0]) as AiResult[];
}

export async function aiEnhance(
  db: Database.Database,
  opts: { limit?: number; level?: string } = {}
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。\n" +
      ".env.local に ANTHROPIC_API_KEY=sk-ant-... を追加してください。"
    );
  }

  const client = new Anthropic({ apiKey });

  // 未補完の単語を取得
  let query  = "SELECT id, word, level, pos FROM words WHERE ai_enhanced = 0";
  const params: unknown[] = [];

  if (opts.level) {
    query += " AND level = ?";
    params.push(opts.level);
  }
  query += " ORDER BY frequency_rank ASC NULLS LAST";
  if (opts.limit) {
    query += " LIMIT ?";
    params.push(opts.limit);
  }

  const words = db.prepare(query).all(...params) as {
    id: number; word: string; level: string; pos: string | null;
  }[];

  console.log(`\n🤖 AI補完を開始... (${words.length} 語、${Math.ceil(words.length / BATCH_SIZE)} バッチ)`);
  if (words.length === 0) {
    console.log("   補完対象なし");
    return;
  }

  const updateWord = db.prepare(
    "UPDATE words SET japanese=?, katakana=?, ai_enhanced=1 WHERE id=?"
  );
  const insertBeginner = db.prepare(`
    INSERT OR REPLACE INTO beginner_examples (word_id, english, japanese)
    VALUES (?, ?, ?)
  `);
  const getWordId = db.prepare("SELECT id FROM words WHERE word = ?");

  let done   = 0;
  let errors = 0;
  let skipped = 0;

  const saveResults = (results: AiResult[]) => {
    db.transaction(() => {
      for (const r of results) {
        const row = getWordId.get(r.word) as { id: number } | undefined;
        if (!row) continue;
        updateWord.run(r.japanese, r.katakana, row.id);
        if (r.example_en && r.example_jp) {
          insertBeginner.run(row.id, r.example_en, r.example_jp);
        }
        done++;
      }
    })();
  };

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(words.length / BATCH_SIZE);
    process.stdout.write(`   バッチ ${batchNum}/${totalBatches} 処理中...`);

    try {
      const results = await processWithAI(client, batch);
      saveResults(results);
      console.log(` ✓ ${results.length} 語`);
    } catch (e) {
      // バッチ失敗時は1語ずつリトライ
      console.log(` ✗ バッチ失敗 → 1語ずつリトライ`);
      errors++;
      for (const word of batch) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        try {
          const results = await processWithAI(client, [word]);
          saveResults(results);
        } catch {
          skipped++;
        }
      }
    }

    if (i + BATCH_SIZE < words.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`   ✓ 補完完了: ${done} 語  バッチエラー: ${errors}  スキップ: ${skipped} 語`);
}

// 単体実行時
if (process.argv[1].endsWith("ai-enhance.ts") || process.argv[1].endsWith("ai-enhance.js")) {
  import("fs").then((fs) => {
    import("path").then((path) => {
      const envPath = path.resolve(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
          const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
          if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        }
      }

      const limitArg = process.argv.find((a) => a.startsWith("--limit="));
      const levelArg = process.argv.find((a) => a.startsWith("--level="));
      const db = getDb();
      setupSchema(db);
      aiEnhance(db, {
        limit: limitArg ? parseInt(limitArg.split("=")[1]) : undefined,
        level: levelArg ? levelArg.split("=")[1] : undefined,
      })
        .then(() => { db.close(); console.log("完了"); })
        .catch((e) => { console.error("エラー:", e.message); db.close(); process.exit(1); });
    });
  });
}
