const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../data/vocabulary.db'));

// 英語の敬称リスト
const honorificsEn = ['mr','mrs','ms','miss','sir','madam','lord','lady','dame','prof'];

// 固有名詞マーカー（AIが (人名) (地名) (固有名詞) を付けたもの）
const properNounMarkers = db.prepare(`
  SELECT id, word, japanese, level FROM words
  WHERE
    japanese LIKE '%（人名）%'
    OR japanese LIKE '%（地名）%'
    OR japanese LIKE '%（固有名詞）%'
    OR japanese LIKE '%(人名)%'
    OR japanese LIKE '%(地名)%'
    OR japanese LIKE '%(固有名詞)%'
  ORDER BY level, word
`).all();

// 英語敬称
const honorifics = db.prepare(`
  SELECT id, word, japanese, level FROM words
  WHERE word IN (${honorificsEn.map(() => '?').join(',')})
`).all(...honorificsEn);

// さん・様を含む日本語訳（敬称）
const keishyo = db.prepare(`
  SELECT id, word, japanese, level FROM words
  WHERE
    japanese LIKE '%さん%'
    OR japanese LIKE '%〜様%'
    OR japanese LIKE '%敬称%'
  ORDER BY word
`).all();

// 重複排除して合計を算出
const ids = new Set([
  ...properNounMarkers.map(r => r.id),
  ...honorifics.map(r => r.id),
  ...keishyo.map(r => r.id),
]);

console.log('=== 固有名詞マーカー（(人名)(地名)(固有名詞)）: ' + properNounMarkers.length + '件 ===');
properNounMarkers.slice(0, 30).forEach(r => console.log('  [' + r.level + '] ' + r.word + ' = ' + r.japanese));
if (properNounMarkers.length > 30) console.log('  ...他 ' + (properNounMarkers.length - 30) + '件');

console.log('\n=== 英語敬称: ' + honorifics.length + '件 ===');
honorifics.forEach(r => console.log('  [' + r.level + '] ' + r.word + ' = ' + r.japanese));

console.log('\n=== さん・様を含む: ' + keishyo.length + '件 ===');
keishyo.forEach(r => console.log('  [' + r.level + '] ' + r.word + ' = ' + r.japanese));

console.log('\n合計（重複除き）: ' + ids.size + '件を削除予定');
