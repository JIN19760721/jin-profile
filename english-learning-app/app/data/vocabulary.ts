export interface Word {
  id: number;
  english: string;
  japanese: string;
  katakana: string;   // カタカナ発音
  example: string;
  exampleJp: string;
  category: string;
  level: "中学" | "高校" | "TOEIC600" | "TOEIC730" | "TOEIC860";
}

export interface Phrase {
  id: number;
  english: string;
  japanese: string;
  situation: string;
  tips?: string;
}

// ── 静的フォールバックデータ（DBが存在しない場合に使用） ────────────────

export const vocabulary: Word[] = [
  // 中学レベル
  { id:  1, english:"achieve",      japanese:"達成する",       katakana:"アチーブ",           example:"She achieved her dream.",                exampleJp:"彼女は夢を達成した。",               category:"動詞",   level:"中学" },
  { id:  2, english:"support",      japanese:"支援する",       katakana:"サポート",            example:"Please support our team.",               exampleJp:"私たちのチームを支援してください。",   category:"動詞",   level:"中学" },
  { id:  3, english:"improve",      japanese:"向上させる",     katakana:"インプルーブ",        example:"I want to improve my English.",           exampleJp:"英語を向上させたい。",               category:"動詞",   level:"中学" },
  { id:  4, english:"develop",      japanese:"発展させる",     katakana:"ディベロップ",        example:"We need to develop new skills.",          exampleJp:"新しいスキルを身につける必要がある。", category:"動詞",   level:"中学" },
  { id:  5, english:"consider",     japanese:"考慮する",       katakana:"コンシダー",          example:"Please consider my proposal.",            exampleJp:"私の提案を考慮してください。",         category:"動詞",   level:"中学" },
  { id:  6, english:"provide",      japanese:"提供する",       katakana:"プロバイド",          example:"The school provides free meals.",         exampleJp:"学校は無料給食を提供している。",      category:"動詞",   level:"中学" },
  { id:  7, english:"require",      japanese:"必要とする",     katakana:"リクワイア",          example:"This job requires experience.",           exampleJp:"この仕事は経験が必要だ。",            category:"動詞",   level:"中学" },
  { id:  8, english:"describe",     japanese:"描写する",       katakana:"ディスクライブ",      example:"Can you describe the problem?",           exampleJp:"問題を説明できますか？",              category:"動詞",   level:"中学" },
  { id:  9, english:"suggest",      japanese:"提案する",       katakana:"サジェスト",          example:"I suggest taking a break.",               exampleJp:"休憩することを提案します。",           category:"動詞",   level:"中学" },
  { id: 10, english:"communicate",  japanese:"伝達する",       katakana:"コミュニケート",      example:"It's important to communicate clearly.", exampleJp:"明確に伝えることが重要だ。",           category:"動詞",   level:"中学" },
  { id: 11, english:"important",    japanese:"重要な",         katakana:"インポータント",      example:"Exercise is important for health.",       exampleJp:"運動は健康に重要だ。",               category:"形容詞", level:"中学" },
  { id: 12, english:"necessary",    japanese:"必要な",         katakana:"ネセサリー",          example:"Sleep is necessary for the body.",        exampleJp:"睡眠は体に必要だ。",                 category:"形容詞", level:"中学" },
  { id: 13, english:"various",      japanese:"様々な",         katakana:"ベアリアス",          example:"There are various ways to study.",        exampleJp:"様々な学習方法がある。",              category:"形容詞", level:"中学" },
  { id: 14, english:"possible",     japanese:"可能な",         katakana:"ポッシブル",          example:"Anything is possible if you try.",        exampleJp:"努力すれば何でも可能だ。",            category:"形容詞", level:"中学" },
  { id: 15, english:"traditional",  japanese:"伝統的な",       katakana:"トラディショナル",    example:"This is a traditional Japanese dish.",   exampleJp:"これは伝統的な日本料理だ。",           category:"形容詞", level:"中学" },
  { id: 16, english:"society",      japanese:"社会",           katakana:"ソサイアティ",        example:"We live in a modern society.",            exampleJp:"私たちは現代社会に生きている。",       category:"名詞",   level:"中学" },
  { id: 17, english:"environment",  japanese:"環境",           katakana:"エンバイロメント",    example:"We must protect the environment.",        exampleJp:"環境を守らなければならない。",         category:"名詞",   level:"中学" },
  { id: 18, english:"technology",   japanese:"技術",           katakana:"テクノロジー",        example:"Technology changes our lives.",           exampleJp:"技術は私たちの生活を変える。",         category:"名詞",   level:"中学" },
  { id: 19, english:"information",  japanese:"情報",           katakana:"インフォメーション",  example:"I need more information.",               exampleJp:"もっと情報が必要だ。",               category:"名詞",   level:"中学" },
  { id: 20, english:"experience",   japanese:"経験",           katakana:"エクスペリエンス",    example:"Travel gives you great experience.",      exampleJp:"旅は素晴らしい経験を与えてくれる。",  category:"名詞",   level:"中学" },
  // 高校レベル
  { id: 21, english:"accomplish",   japanese:"成し遂げる",     katakana:"アコンプリッシュ",    example:"She accomplished her goal.",              exampleJp:"彼女は目標を成し遂げた。",            category:"動詞",   level:"高校" },
  { id: 22, english:"collaborate",  japanese:"協力する",       katakana:"コラボレート",        example:"Let's collaborate on this project.",      exampleJp:"このプロジェクトで協力しましょう。",   category:"動詞",   level:"高校" },
  { id: 23, english:"hesitate",     japanese:"ためらう",       katakana:"ヘジテート",          example:"Don't hesitate to ask questions.",        exampleJp:"遠慮なく質問してください。",           category:"動詞",   level:"高校" },
  { id: 24, english:"maintain",     japanese:"維持する",       katakana:"メインテイン",        example:"We must maintain good habits.",           exampleJp:"良い習慣を維持しなければならない。",   category:"動詞",   level:"高校" },
  { id: 25, english:"appreciate",   japanese:"感謝する",       katakana:"アプリシエート",      example:"I appreciate your kindness.",             exampleJp:"ご親切に感謝します。",               category:"動詞",   level:"高校" },
  { id: 26, english:"demonstrate",  japanese:"示す・証明する", katakana:"デモンストレート",    example:"Please demonstrate how it works.",        exampleJp:"どのように動くか示してください。",     category:"動詞",   level:"高校" },
  { id: 27, english:"emphasize",    japanese:"強調する",       katakana:"エンファサイズ",      example:"She emphasized the importance of study.", exampleJp:"彼女は勉強の重要性を強調した。",      category:"動詞",   level:"高校" },
  { id: 28, english:"negotiate",    japanese:"交渉する",       katakana:"ニゴシエート",        example:"We need to negotiate the price.",         exampleJp:"価格を交渉する必要がある。",           category:"動詞",   level:"高校" },
  { id: 29, english:"challenge",    japanese:"挑戦する",       katakana:"チャレンジ",          example:"I will challenge myself every day.",      exampleJp:"毎日自分に挑戦します。",               category:"動詞",   level:"高校" },
  { id: 30, english:"diverse",      japanese:"多様な",         katakana:"ダイバース",          example:"Our school has a diverse community.",     exampleJp:"私たちの学校は多様なコミュニティだ。", category:"形容詞", level:"高校" },
  { id: 31, english:"significant",  japanese:"重要な・かなりの",katakana:"シグニフィカント",   example:"This is a significant discovery.",        exampleJp:"これは重要な発見だ。",               category:"形容詞", level:"高校" },
  { id: 32, english:"fundamental",  japanese:"基本的な",       katakana:"ファンダメンタル",    example:"Trust is fundamental in friendship.",     exampleJp:"信頼は友情の基本だ。",               category:"形容詞", level:"高校" },
  { id: 33, english:"innovative",   japanese:"革新的な",       katakana:"イノベーティブ",      example:"This is an innovative solution.",         exampleJp:"これは革新的な解決策だ。",            category:"形容詞", level:"高校" },
  { id: 34, english:"efficient",    japanese:"効率的な",       katakana:"エフィシェント",      example:"This method is more efficient.",          exampleJp:"この方法はより効率的だ。",            category:"形容詞", level:"高校" },
  { id: 35, english:"grateful",     japanese:"感謝している",   katakana:"グレートフル",        example:"I'm grateful for your help.",            exampleJp:"助けてくれてありがとう。",            category:"形容詞", level:"高校" },
  { id: 36, english:"fluent",       japanese:"流暢な",         katakana:"フルーエント",        example:"She is fluent in three languages.",       exampleJp:"彼女は3カ国語が流暢だ。",            category:"形容詞", level:"高校" },
  { id: 37, english:"perspective",  japanese:"視点・観点",     katakana:"パースペクティブ",    example:"Try to see it from my perspective.",      exampleJp:"私の視点から見てみて。",              category:"名詞",   level:"高校" },
  { id: 38, english:"opportunity",  japanese:"機会",           katakana:"オポチュニティ",      example:"This is a great opportunity.",            exampleJp:"これは素晴らしい機会だ。",            category:"名詞",   level:"高校" },
  { id: 39, english:"consequence",  japanese:"結果・影響",     katakana:"コンシクエンス",      example:"Think about the consequences.",           exampleJp:"結果について考えてください。",         category:"名詞",   level:"高校" },
  { id: 40, english:"enthusiasm",   japanese:"熱意・熱心さ",   katakana:"エンシュージアズム",  example:"He showed great enthusiasm.",            exampleJp:"彼は大きな熱意を見せた。",            category:"名詞",   level:"高校" },
  // TOEIC600レベル
  { id: 41, english:"persevere",    japanese:"忍耐する",       katakana:"パーセビア",          example:"You must persevere to succeed.",          exampleJp:"成功するには忍耐しなければならない。", category:"動詞",   level:"TOEIC600" },
  { id: 42, english:"comprehend",   japanese:"理解する",       katakana:"コンプリヘンド",      example:"I can't comprehend this theory.",         exampleJp:"この理論を理解できない。",            category:"動詞",   level:"TOEIC600" },
  { id: 43, english:"elaborate",    japanese:"詳しく述べる",   katakana:"エラボレート",        example:"Could you elaborate on that point?",      exampleJp:"その点をもう少し詳しく説明できますか？", category:"動詞", level:"TOEIC600" },
  { id: 44, english:"acknowledge",  japanese:"認める",         katakana:"アクノレッジ",        example:"You must acknowledge your mistakes.",     exampleJp:"自分の間違いを認めなければならない。", category:"動詞",   level:"TOEIC600" },
  { id: 45, english:"anticipate",   japanese:"予期する",       katakana:"アンティシペート",    example:"We didn't anticipate this problem.",      exampleJp:"この問題を予期していなかった。",       category:"動詞",   level:"TOEIC600" },
  { id: 46, english:"consequently", japanese:"その結果として", katakana:"コンシクエントリー",  example:"He was tired; consequently, he slept early.", exampleJp:"疲れていた。その結果、早く寝た。", category:"副詞",  level:"TOEIC600" },
  { id: 47, english:"simultaneously",japanese:"同時に",        katakana:"サイマルテイニアスリー",example:"They spoke simultaneously.",           exampleJp:"彼らは同時に話した。",               category:"副詞",   level:"TOEIC600" },
  { id: 48, english:"inevitable",   japanese:"避けられない",   katakana:"イネビタブル",        example:"Change is inevitable.",                   exampleJp:"変化は避けられない。",               category:"形容詞", level:"TOEIC600" },
  { id: 49, english:"controversial",japanese:"議論を呼ぶ",     katakana:"コントラバーシャル",  example:"This is a controversial topic.",          exampleJp:"これは議論を呼ぶテーマだ。",           category:"形容詞", level:"TOEIC600" },
  { id: 50, english:"sophisticated",japanese:"洗練された",     katakana:"ソフィスティケイテッド",example:"She has sophisticated taste.",          exampleJp:"彼女は洗練された趣味を持つ。",         category:"形容詞", level:"TOEIC600" },
  { id: 51, english:"ambiguous",    japanese:"曖昧な",         katakana:"アンビギュアス",      example:"His answer was ambiguous.",               exampleJp:"彼の答えは曖昧だった。",               category:"形容詞", level:"TOEIC600" },
  { id: 52, english:"sustainable",  japanese:"持続可能な",     katakana:"サステイナブル",      example:"We need sustainable energy.",             exampleJp:"持続可能なエネルギーが必要だ。",       category:"形容詞", level:"TOEIC600" },
  { id: 53, english:"vulnerable",   japanese:"傷つきやすい",   katakana:"バルナラブル",        example:"Children are vulnerable to disease.",     exampleJp:"子供は病気にかかりやすい。",           category:"形容詞", level:"TOEIC600" },
  { id: 54, english:"contradictory",japanese:"矛盾した",       katakana:"コントラディクトリー",example:"The evidence is contradictory.",          exampleJp:"証拠は矛盾している。",               category:"形容詞", level:"TOEIC600" },
  { id: 55, english:"phenomenon",   japanese:"現象",           katakana:"フィノミノン",        example:"This is a rare phenomenon.",              exampleJp:"これは珍しい現象だ。",               category:"名詞",   level:"TOEIC600" },
  { id: 56, english:"implication",  japanese:"含意・影響",     katakana:"インプリケーション",  example:"Think about the implications.",           exampleJp:"影響について考えてください。",         category:"名詞",   level:"TOEIC600" },
  { id: 57, english:"prejudice",    japanese:"偏見",           katakana:"プレジュディス",      example:"We must overcome prejudice.",             exampleJp:"偏見を克服しなければならない。",       category:"名詞",   level:"TOEIC600" },
  // TOEIC730レベル
  { id: 58, english:"globalization",japanese:"グローバル化",   katakana:"グローバリゼーション",example:"Globalization affects all countries.",   exampleJp:"グローバル化は全ての国に影響する。",   category:"名詞",   level:"TOEIC730" },
  { id: 59, english:"infrastructure",japanese:"インフラ",      katakana:"インフラストラクチャー",example:"The city needs better infrastructure.", exampleJp:"市はより良いインフラが必要だ。",       category:"名詞",   level:"TOEIC730" },
  { id: 60, english:"diversity",    japanese:"多様性",         katakana:"ダイバーシティ",      example:"Diversity makes teams stronger.",         exampleJp:"多様性はチームを強くする。",           category:"名詞",   level:"TOEIC730" },
];

export const phrases: Phrase[] = [
  { id:  1, english:"Could you say that again?",         japanese:"もう一度言っていただけますか？",         situation:"聞き返すとき",       tips:"「Pardon?」より丁寧な表現です" },
  { id:  2, english:"I'll get back to you on that.",     japanese:"それについてはまたご連絡します。",       situation:"ビジネスシーン",     tips:"返答を保留するときに使います" },
  { id:  3, english:"That makes sense.",                 japanese:"なるほど、分かりました。",               situation:"理解を示すとき",     tips:"「I see」より知的な印象を与えます" },
  { id:  4, english:"I appreciate your help.",           japanese:"ご協力ありがとうございます。",           situation:"感謝を伝えるとき" },
  { id:  5, english:"Would you mind if I...?",           japanese:"〜してもよろしいですか？",               situation:"許可を求めるとき",   tips:"非常に丁寧な表現です" },
  { id:  6, english:"Let me think about it.",            japanese:"考えさせてください。",                   situation:"時間を稼ぐとき" },
  { id:  7, english:"I'm looking forward to it.",        japanese:"楽しみにしています。",                   situation:"期待を伝えるとき" },
  { id:  8, english:"Could you elaborate on that?",      japanese:"もう少し詳しく説明していただけますか？", situation:"詳細を求めるとき",   tips:"ビジネス英語でよく使われます" },
  { id:  9, english:"That's a great point.",             japanese:"それは素晴らしい指摘ですね。",           situation:"同意するとき" },
  { id: 10, english:"I hate to break it to you, but...",japanese:"言いにくいのですが…",                   situation:"悪い知らせを伝えるとき" },
  { id: 11, english:"Bear with me for a moment.",        japanese:"少しお待ちください。",                   situation:"待ってもらうとき" },
  { id: 12, english:"To be honest with you...",          japanese:"正直に言うと…",                         situation:"率直な意見を言うとき" },
];
