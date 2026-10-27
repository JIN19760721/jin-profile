const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../data/vocabulary.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── 削除対象ID収集 ────────────────────────────────

// 1. AIが (人名)(地名)(固有名詞) を付けたもの
const properNouns = db.prepare(`
  SELECT id FROM words
  WHERE
    japanese LIKE '%（人名）%'
    OR japanese LIKE '%（地名）%'
    OR japanese LIKE '%（固有名詞）%'
    OR japanese LIKE '%(人名)%'
    OR japanese LIKE '%(地名)%'
    OR japanese LIKE '%(固有名詞)%'
`).all().map(r => r.id);

// 2. 英語の敬称タイトル（miss/lord/lady/dame 等の一般語は除外）
const honorificWords = [
  'mr', 'mrs', 'ms', 'sir', 'mister',  // 英語敬称
  'san',                                 // さん（日本語敬称がそのまま英語として登録）
  'senor', 'senora', 'senorita',         // スペイン語敬称
  'signor', 'signora',                   // イタリア語敬称
  'monsieur', 'madame',                  // フランス語敬称（madam は別）
  'herr', 'frau',                        // ドイツ語敬称
  'oppa',                                // 韓国語敬称
];
const honorifics = db.prepare(`
  SELECT id FROM words WHERE word IN (${honorificWords.map(() => '?').join(',')})
`).all(...honorificWords).map(r => r.id);

// 重複を除いた削除対象
const deleteIds = [...new Set([...properNouns, ...honorifics])];
console.log(`削除対象: ${deleteIds.length} 件`);
console.log(`  固有名詞マーカー付き: ${properNouns.length} 件`);
console.log(`  敬称タイトル: ${honorifics.length} 件`);

// ── 削除実行 ──────────────────────────────────────

const CHUNK = 500; // SQLite の IN句の上限対策

function deleteChunked(ids) {
  let totalWords = 0, totalExamples = 0;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');

    // 例文を先に削除（外部キー制約）
    const exResult = db.prepare(
      `DELETE FROM beginner_examples WHERE word_id IN (${placeholders})`
    ).run(...chunk);
    totalExamples += exResult.changes;

    // 単語を削除
    const wResult = db.prepare(
      `DELETE FROM words WHERE id IN (${placeholders})`
    ).run(...chunk);
    totalWords += wResult.changes;
  }

  return { totalWords, totalExamples };
}

const { totalWords, totalExamples } = db.transaction(() => deleteChunked(deleteIds))();

console.log(`\n✅ 削除完了`);
console.log(`  単語: ${totalWords} 件削除`);
console.log(`  例文: ${totalExamples} 件削除`);

// ── 残件数の確認 ─────────────────────────────────

const remaining = db.prepare('SELECT COUNT(*) as cnt FROM words').get();
console.log(`\n残り単語数: ${remaining.cnt} 件`);

// WAL チェックポイント（DBファイルに反映）
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
