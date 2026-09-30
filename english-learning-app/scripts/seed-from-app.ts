/**
 * アプリ既存データ (app/data/vocabulary.ts) を SQLite に移行するスクリプト
 * NGSL/BSL ファイルを入手する前でもDBを使い始めることができます。
 */
import Database from "better-sqlite3";
import { getDb, setupSchema } from "./db.js";

const SOURCE = {
  name:        "英会話マスター アプリ組み込みデータ",
  short_name:  "APP",
  url:         "https://github.com/",
  license:     "MIT",
  license_url: "https://opensource.org/licenses/MIT",
};

// vocabulary.ts のデータを直接埋め込み（動的importの代わり）
const WORDS = [
  // 初級（高校1年）
  { word:"achieve",     japanese:"達成する",     katakana:"アチーブ",       pos:"verb",      rank:1,  band:1 },
  { word:"support",     japanese:"支援する",     katakana:"サポート",       pos:"verb",      rank:2,  band:1 },
  { word:"improve",     japanese:"向上させる",   katakana:"インプルーブ",   pos:"verb",      rank:3,  band:1 },
  { word:"develop",     japanese:"発展させる",   katakana:"ディベロップ",   pos:"verb",      rank:4,  band:1 },
  { word:"consider",    japanese:"考慮する",     katakana:"コンシダー",     pos:"verb",      rank:5,  band:1 },
  { word:"provide",     japanese:"提供する",     katakana:"プロバイド",     pos:"verb",      rank:6,  band:1 },
  { word:"require",     japanese:"必要とする",   katakana:"リクワイア",     pos:"verb",      rank:7,  band:1 },
  { word:"describe",    japanese:"描写する",     katakana:"ディスクライブ", pos:"verb",      rank:8,  band:1 },
  { word:"suggest",     japanese:"提案する",     katakana:"サジェスト",     pos:"verb",      rank:9,  band:1 },
  { word:"communicate", japanese:"伝達する",     katakana:"コミュニケート", pos:"verb",      rank:10, band:1 },
  { word:"important",   japanese:"重要な",       katakana:"インポータント", pos:"adjective", rank:11, band:1 },
  { word:"necessary",   japanese:"必要な",       katakana:"ネセサリー",     pos:"adjective", rank:12, band:1 },
  { word:"various",     japanese:"様々な",       katakana:"ベアリアス",     pos:"adjective", rank:13, band:1 },
  { word:"possible",    japanese:"可能な",       katakana:"ポッシブル",     pos:"adjective", rank:14, band:1 },
  { word:"traditional", japanese:"伝統的な",     katakana:"トラディショナル",pos:"adjective",rank:15, band:1 },
  { word:"society",     japanese:"社会",         katakana:"ソサイアティ",   pos:"noun",      rank:16, band:1 },
  { word:"environment", japanese:"環境",         katakana:"エンバイロメント",pos:"noun",     rank:17, band:1 },
  { word:"technology",  japanese:"技術",         katakana:"テクノロジー",   pos:"noun",      rank:18, band:1 },
  { word:"information", japanese:"情報",         katakana:"インフォメーション",pos:"noun",   rank:19, band:1 },
  { word:"experience",  japanese:"経験",         katakana:"エクスペリエンス",pos:"noun",     rank:20, band:1 },
  // 中級（高校2年）
  { word:"accomplish",   japanese:"成し遂げる",   katakana:"アコンプリッシュ", pos:"verb",      rank:21, band:2 },
  { word:"collaborate",  japanese:"協力する",     katakana:"コラボレート",     pos:"verb",      rank:22, band:2 },
  { word:"hesitate",     japanese:"ためらう",     katakana:"ヘジテート",       pos:"verb",      rank:23, band:2 },
  { word:"maintain",     japanese:"維持する",     katakana:"メインテイン",     pos:"verb",      rank:24, band:2 },
  { word:"appreciate",   japanese:"感謝する",     katakana:"アプリシエート",   pos:"verb",      rank:25, band:2 },
  { word:"demonstrate",  japanese:"示す・証明する",katakana:"デモンストレート", pos:"verb",      rank:26, band:2 },
  { word:"emphasize",    japanese:"強調する",     katakana:"エンファサイズ",   pos:"verb",      rank:27, band:2 },
  { word:"negotiate",    japanese:"交渉する",     katakana:"ニゴシエート",     pos:"verb",      rank:28, band:2 },
  { word:"challenge",    japanese:"挑戦する",     katakana:"チャレンジ",       pos:"verb",      rank:29, band:2 },
  { word:"diverse",      japanese:"多様な",       katakana:"ダイバース",       pos:"adjective", rank:30, band:2 },
  { word:"significant",  japanese:"重要な・かなりの",katakana:"シグニフィカント",pos:"adjective",rank:31, band:2 },
  { word:"fundamental",  japanese:"基本的な",     katakana:"ファンダメンタル", pos:"adjective", rank:32, band:2 },
  { word:"innovative",   japanese:"革新的な",     katakana:"イノベーティブ",   pos:"adjective", rank:33, band:2 },
  { word:"efficient",    japanese:"効率的な",     katakana:"エフィシェント",   pos:"adjective", rank:34, band:2 },
  { word:"grateful",     japanese:"感謝している", katakana:"グレートフル",     pos:"adjective", rank:35, band:2 },
  { word:"fluent",       japanese:"流暢な",       katakana:"フルーエント",     pos:"adjective", rank:36, band:2 },
  { word:"perspective",  japanese:"視点・観点",   katakana:"パースペクティブ", pos:"noun",      rank:37, band:2 },
  { word:"opportunity",  japanese:"機会",         katakana:"オポチュニティ",   pos:"noun",      rank:38, band:2 },
  { word:"consequence",  japanese:"結果・影響",   katakana:"コンシクエンス",   pos:"noun",      rank:39, band:2 },
  { word:"enthusiasm",   japanese:"熱意・熱心さ", katakana:"エンシュージアズム",pos:"noun",     rank:40, band:2 },
  // 上級（高校3年）
  { word:"persevere",     japanese:"忍耐する",     katakana:"パーセビア",         pos:"verb",      rank:41, band:3 },
  { word:"comprehend",    japanese:"理解する",     katakana:"コンプリヘンド",     pos:"verb",      rank:42, band:3 },
  { word:"elaborate",     japanese:"詳しく述べる", katakana:"エラボレート",       pos:"verb",      rank:43, band:3 },
  { word:"acknowledge",   japanese:"認める",       katakana:"アクノレッジ",       pos:"verb",      rank:44, band:3 },
  { word:"anticipate",    japanese:"予期する",     katakana:"アンティシペート",   pos:"verb",      rank:45, band:3 },
  { word:"consequently",  japanese:"その結果として",katakana:"コンシクエントリー", pos:"adverb",    rank:46, band:3 },
  { word:"simultaneously",japanese:"同時に",       katakana:"サイマルテイニアスリー",pos:"adverb",  rank:47, band:3 },
  { word:"inevitable",    japanese:"避けられない", katakana:"イネビタブル",       pos:"adjective", rank:48, band:3 },
  { word:"controversial", japanese:"議論を呼ぶ",   katakana:"コントラバーシャル", pos:"adjective", rank:49, band:3 },
  { word:"sophisticated", japanese:"洗練された",   katakana:"ソフィスティケイテッド",pos:"adjective",rank:50, band:3 },
  { word:"ambiguous",     japanese:"曖昧な",       katakana:"アンビギュアス",     pos:"adjective", rank:51, band:3 },
  { word:"sustainable",   japanese:"持続可能な",   katakana:"サステイナブル",     pos:"adjective", rank:52, band:3 },
  { word:"vulnerable",    japanese:"傷つきやすい", katakana:"バルナラブル",       pos:"adjective", rank:53, band:3 },
  { word:"contradictory", japanese:"矛盾した",     katakana:"コントラディクトリー",pos:"adjective",rank:54, band:3 },
  { word:"phenomenon",    japanese:"現象",         katakana:"フィノミノン",       pos:"noun",      rank:55, band:3 },
  { word:"implication",   japanese:"含意・影響",   katakana:"インプリケーション", pos:"noun",      rank:56, band:3 },
  { word:"prejudice",     japanese:"偏見",         katakana:"プレジュディス",     pos:"noun",      rank:57, band:3 },
  { word:"globalization", japanese:"グローバル化", katakana:"グローバリゼーション",pos:"noun",     rank:58, band:4 },
  { word:"infrastructure",japanese:"インフラ",     katakana:"インフラストラクチャー",pos:"noun",   rank:59, band:4 },
  { word:"diversity",     japanese:"多様性",       katakana:"ダイバーシティ",     pos:"noun",      rank:60, band:4 },
];

const BEGINNER_EXAMPLES: Record<string, { en: string; jp: string }> = {
  achieve:      { en: "She achieved her dream.",                  jp: "彼女は夢を達成した。" },
  support:      { en: "Please support our team.",                 jp: "私たちのチームを支援してください。" },
  improve:      { en: "I want to improve my English.",            jp: "英語を向上させたい。" },
  develop:      { en: "We need to develop new skills.",           jp: "新しいスキルを身につける必要がある。" },
  consider:     { en: "Please consider my proposal.",             jp: "私の提案を考慮してください。" },
  provide:      { en: "The school provides free meals.",          jp: "学校は無料給食を提供している。" },
  require:      { en: "This job requires experience.",            jp: "この仕事は経験が必要だ。" },
  describe:     { en: "Can you describe the problem?",            jp: "問題を説明できますか？" },
  suggest:      { en: "I suggest taking a break.",                jp: "休憩することを提案します。" },
  communicate:  { en: "It's important to communicate clearly.",   jp: "明確に伝えることが重要だ。" },
  important:    { en: "Exercise is important for health.",        jp: "運動は健康に重要だ。" },
  necessary:    { en: "Sleep is necessary for the body.",         jp: "睡眠は体に必要だ。" },
  various:      { en: "There are various ways to study.",         jp: "様々な学習方法がある。" },
  possible:     { en: "Anything is possible if you try.",         jp: "努力すれば何でも可能だ。" },
  traditional:  { en: "This is a traditional Japanese dish.",     jp: "これは伝統的な日本料理だ。" },
  society:      { en: "We live in a modern society.",             jp: "私たちは現代社会に生きている。" },
  environment:  { en: "We must protect the environment.",         jp: "環境を守らなければならない。" },
  technology:   { en: "Technology changes our lives.",            jp: "技術は私たちの生活を変える。" },
  information:  { en: "I need more information.",                 jp: "もっと情報が必要だ。" },
  experience:   { en: "Travel gives you great experience.",       jp: "旅は素晴らしい経験を与えてくれる。" },
  accomplish:   { en: "She accomplished her goal.",               jp: "彼女は目標を成し遂げた。" },
  collaborate:  { en: "Let's collaborate on this project.",       jp: "このプロジェクトで協力しましょう。" },
  hesitate:     { en: "Don't hesitate to ask questions.",         jp: "遠慮なく質問してください。" },
  maintain:     { en: "We must maintain good habits.",            jp: "良い習慣を維持しなければならない。" },
  appreciate:   { en: "I appreciate your kindness.",              jp: "ご親切に感謝します。" },
  demonstrate:  { en: "Please demonstrate how it works.",         jp: "どのように動くか示してください。" },
  emphasize:    { en: "She emphasized the importance of study.",  jp: "彼女は勉強の重要性を強調した。" },
  negotiate:    { en: "We need to negotiate the price.",          jp: "価格を交渉する必要がある。" },
  challenge:    { en: "I will challenge myself every day.",       jp: "毎日自分に挑戦します。" },
  diverse:      { en: "Our school has a diverse community.",      jp: "私たちの学校は多様なコミュニティだ。" },
  significant:  { en: "This is a significant discovery.",         jp: "これは重要な発見だ。" },
  fundamental:  { en: "Trust is fundamental in friendship.",      jp: "信頼は友情の基本だ。" },
  innovative:   { en: "This is an innovative solution.",          jp: "これは革新的な解決策だ。" },
  efficient:    { en: "This method is more efficient.",           jp: "この方法はより効率的だ。" },
  grateful:     { en: "I'm grateful for your help.",             jp: "助けてくれてありがとう。" },
  fluent:       { en: "She is fluent in three languages.",        jp: "彼女は3カ国語が流暢だ。" },
  perspective:  { en: "Try to see it from my perspective.",       jp: "私の視点から見てみて。" },
  opportunity:  { en: "This is a great opportunity.",             jp: "これは素晴らしい機会だ。" },
  consequence:  { en: "Think about the consequences.",            jp: "結果について考えてください。" },
  enthusiasm:   { en: "He showed great enthusiasm.",              jp: "彼は大きな熱意を見せた。" },
  persevere:    { en: "You must persevere to succeed.",           jp: "成功するには忍耐しなければならない。" },
  comprehend:   { en: "I can't comprehend this theory.",          jp: "この理論を理解できない。" },
  elaborate:    { en: "Could you elaborate on that point?",       jp: "その点をもう少し詳しく説明できますか？" },
  acknowledge:  { en: "You must acknowledge your mistakes.",      jp: "自分の間違いを認めなければならない。" },
  anticipate:   { en: "We didn't anticipate this problem.",       jp: "この問題を予期していなかった。" },
  consequently: { en: "He was tired; consequently, he slept early.", jp: "疲れていた。その結果、早く寝た。" },
  simultaneously:{en: "They spoke simultaneously.",               jp: "彼らは同時に話した。" },
  inevitable:   { en: "Change is inevitable.",                    jp: "変化は避けられない。" },
  controversial:{ en: "This is a controversial topic.",           jp: "これは議論を呼ぶテーマだ。" },
  sophisticated:{ en: "She has sophisticated taste.",             jp: "彼女は洗練された趣味を持つ。" },
  ambiguous:    { en: "His answer was ambiguous.",                jp: "彼の答えは曖昧だった。" },
  sustainable:  { en: "We need sustainable energy.",              jp: "持続可能なエネルギーが必要だ。" },
  vulnerable:   { en: "Children are vulnerable to disease.",      jp: "子供は病気にかかりやすい。" },
  contradictory:{ en: "The evidence is contradictory.",           jp: "証拠は矛盾している。" },
  phenomenon:   { en: "This is a rare phenomenon.",               jp: "これは珍しい現象だ。" },
  implication:  { en: "Think about the implications.",            jp: "影響について考えてください。" },
  prejudice:    { en: "We must overcome prejudice.",              jp: "偏見を克服しなければならない。" },
  globalization:{ en: "Globalization affects all countries.",     jp: "グローバル化は全ての国に影響する。" },
  infrastructure:{en: "The city needs better infrastructure.",    jp: "市はより良いインフラが必要だ。" },
  diversity:    { en: "Diversity makes teams stronger.",          jp: "多様性はチームを強くする。" },
};

function bandToLevel(band: number): string {
  if (band <= 1) return "中学";
  if (band <= 2) return "高校";
  if (band <= 3) return "TOEIC600";
  if (band <= 4) return "TOEIC730";
  return "TOEIC860";
}

export function seedFromApp(db: Database.Database): void {
  console.log("\n🌱 アプリ組み込みデータをシード中...");

  db.prepare(`
    INSERT OR IGNORE INTO sources (name, short_name, url, license, license_url, fetched_at)
    VALUES (@name, @short_name, @url, @license, @license_url, @fetched_at)
  `).run({ ...SOURCE, fetched_at: new Date().toISOString() });

  const { id: sourceId } = db
    .prepare("SELECT id FROM sources WHERE short_name = ?")
    .get(SOURCE.short_name) as { id: number };

  const insertWord = db.prepare(`
    INSERT OR IGNORE INTO words (word, pos, frequency_rank, band, source_id, level, japanese, katakana, ai_enhanced)
    VALUES (@word, @pos, @rank, @band, @sourceId, @level, @japanese, @katakana, 1)
  `);
  const insertBeginner = db.prepare(`
    INSERT OR REPLACE INTO beginner_examples (word_id, english, japanese)
    VALUES (?, ?, ?)
  `);
  const getWordId = db.prepare("SELECT id FROM words WHERE word = ?");

  let inserted = 0;
  db.transaction(() => {
    for (const w of WORDS) {
      const result = insertWord.run({
        word: w.word, pos: w.pos, rank: w.rank, band: w.band,
        sourceId, level: bandToLevel(w.band),
        japanese: w.japanese, katakana: w.katakana,
      });
      if (result.changes > 0) inserted++;

      const ex = BEGINNER_EXAMPLES[w.word];
      if (ex) {
        const row = getWordId.get(w.word) as { id: number } | undefined;
        if (row) insertBeginner.run(row.id, ex.en, ex.jp);
      }
    }
  })();

  console.log(`   ✓ ${inserted} 語をシードしました`);
}

if (process.argv[1].includes("seed-from-app")) {
  const db = getDb();
  setupSchema(db);
  seedFromApp(db);
  db.close();
  console.log("完了");
}
