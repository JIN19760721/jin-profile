// 英検準2級ライティング向け 基本文法ドリル50問・並べ替え50問
// 英作文でよく出るミス（時制・冠詞・単複・主語と動詞の一致・語順・接続詞など）を練習する。
// オリジナル作成。

import type { GrammarDrill, ReorderDrill, WeaknessTag } from "../lib/eiken/types";

type G = [kind: GrammarDrill["kind"], prompt: string, promptJp: string, options: string[], answer: number, explain: string, tag: WeaknessTag];

const G_ROWS: G[] = [
  // ── 主語と動詞の一致 ──
  ["fix", "", "「私はこの考えに賛成です。」正しい英文は？", ["I am agree with this idea.", "I agree with this idea.", "I agreeing with this idea.", "I agrees with this idea."], 1, "agree は動詞なので am は不要です。I agree with ～ で「～に賛成です」。", "agreement"],
  ["fill", "My brother ____ soccer every Sunday.", "兄は毎週日曜日にサッカーをします。", ["play", "plays", "playing", "are playing"], 1, "主語が he/she/1人の人で現在の習慣なら、動詞に -s をつけます。", "agreement"],
  ["fill", "Many students ____ smartphones at school.", "多くの生徒が学校でスマートフォンを使います。", ["uses", "is using", "use", "to use"], 2, "主語 Many students は複数なので、動詞に -s はつけません。", "agreement"],
  ["fill", "Studying English ____ fun.", "英語を勉強するのは楽しいです。", ["are", "is", "be", "were"], 1, "動名詞（～すること）が主語のときは単数扱いで is を使います。", "agreement"],
  ["fill", "There ____ many parks in my town.", "私の町には公園がたくさんあります。", ["is", "are", "has", "have"], 1, "There is/are の後ろの名詞が複数（many parks）なら are です。", "agreement"],
  ["fix", "", "「それは人々の役に立ちます。」正しい英文は？", ["It help people.", "It helps people.", "It helping people.", "It is help people."], 1, "主語 It は単数なので helps。is と一般動詞を並べないように注意。", "agreement"],
  ["fill", "Everyone ____ to be happy.", "誰もが幸せになりたいと思っています。", ["want", "wants", "are wanting", "wanting"], 1, "everyone は単数扱いなので wants です。", "agreement"],
  // ── 時制 ──
  ["fill", "Last summer, I ____ to Okinawa with my family.", "去年の夏、家族と沖縄に行きました。", ["go", "goes", "went", "have gone"], 2, "Last summer（過去の時点）があるので過去形 went です。", "tense"],
  ["fill", "In the future, more people ____ e-books.", "将来、もっと多くの人が電子書籍を読むでしょう。", ["read", "will read", "reading", "were reading"], 1, "未来のことは will ＋動詞の原形で表します。", "tense"],
  ["fill", "I ____ English for three years.", "私は3年間英語を勉強しています。", ["study", "am study", "have studied", "studied ago"], 2, "過去から今まで続いていることは現在完了 have ＋過去分詞で表します。", "tense"],
  ["fix", "", "「昨日、宿題を終えました。」正しい英文は？", ["I finish my homework yesterday.", "I finished my homework yesterday.", "I have finished my homework yesterday.", "I am finish my homework yesterday."], 1, "yesterday がある文は過去形。現在完了は yesterday と一緒に使えません。", "tense"],
  ["fill", "If it ____ tomorrow, we will stay home.", "明日雨が降ったら、家にいます。", ["will rain", "rains", "rained", "raining"], 1, "if（もし～なら）の中では、未来のことでも現在形を使います。", "tense"],
  ["fill", "When I was a child, I ____ playing outside.", "子どものころ、外で遊ぶのが好きでした。", ["like", "liked", "likes", "will like"], 1, "When I was a child（過去）に合わせて liked にします。", "tense"],
  // ── 冠詞 ──
  ["fill", "I want to be ____ teacher in the future.", "将来、先生になりたいです。", ["a", "an", "the", "（なし）"], 0, "1人の先生（数えられる名詞・単数）なので a をつけます。", "article"],
  ["fill", "She ate ____ apple for breakfast.", "彼女は朝食にリンゴを1つ食べました。", ["a", "an", "（なし）", "much"], 1, "apple は母音の音で始まるので an です。", "article"],
  ["fill", "I usually go to school by ____ bus.", "私はたいていバスで通学します。", ["a", "the", "（なし）", "an"], 2, "by bus / by train のように交通手段を表す by の後は冠詞をつけません。", "article"],
  ["fill", "I have a dog. ____ dog is very cute.", "私は犬を飼っています。その犬はとてもかわいいです。", ["A", "An", "The", "（なし）"], 2, "2回目に出てくる「その犬」は the dog です。", "article"],
  ["fix", "", "「スマートフォンは便利です。」正しい英文は？", ["Smartphone is useful.", "Smartphones are useful.", "A smartphones are useful.", "The smartphone are useful."], 1, "一般的に「～というもの」と言うときは、複数形にするのが自然です。", "article"],
  ["fill", "____ Internet is useful for students.", "インターネットは生徒に役立ちます。", ["A", "An", "The", "（なし）"], 2, "the Internet は the をつけて使うのが一般的です。", "article"],
  // ── 単数・複数 ──
  ["fill", "I have two ____.", "私には兄弟が2人います。", ["brother", "brothers", "a brother", "brother's"], 1, "2人以上なので複数形 brothers にします。", "plural"],
  ["fill", "Many ____ like this park.", "多くの子どもがこの公園を好きです。", ["child", "childs", "children", "a child"], 2, "child の複数形は children（不規則な変化）です。", "plural"],
  ["fix", "", "「多くの人がそれを使います。」正しい英文は？", ["Many peoples use it.", "Many people use it.", "Many people uses it.", "Much people use it."], 1, "people はそれだけで複数の意味です。peoples にせず、動詞も use です。", "plural"],
  ["fill", "We should not waste ____.", "私たちは食べ物を無駄にするべきではありません。", ["foods", "a food", "food", "many food"], 2, "food は数えない名詞として使うのが普通です。", "plural"],
  ["fill", "There are a lot of ____ in the library.", "図書館にはたくさんの本があります。", ["book", "books", "a book", "bookes"], 1, "a lot of の後の数えられる名詞は複数形です。", "plural"],
  ["fill", "I don't have much ____.", "私はあまりお金を持っていません。", ["moneys", "money", "a money", "many money"], 1, "money は数えない名詞なので much と一緒に使い、複数形にしません。", "plural"],
  ["fill", "One of my friends ____ in Canada.", "友だちの1人はカナダに住んでいます。", ["live", "lives", "living", "are living"], 1, "主語は One（1人）なので lives です。", "agreement"],
  // ── 語順 ──
  ["fix", "", "「私は毎日英語を勉強します。」正しい英文は？", ["I English study every day.", "I study English every day.", "Every day English I study.", "I study every day English."], 1, "英語は「主語 → 動詞 → 目的語 → 時」の順番です。", "word_order"],
  ["fix", "", "「彼女はいつも早く起きます。」正しい英文は？", ["She gets always up early.", "She always gets up early.", "Always she gets up early.", "She gets up early always is."], 1, "always などの頻度の副詞は一般動詞の前に置きます。", "word_order"],
  ["fix", "", "「それはとても良い考えです。」正しい英文は？", ["It is a very good idea.", "It is very a good idea.", "It is a good very idea.", "It very is a good idea."], 0, "a ＋ very ＋ 形容詞 ＋ 名詞 の順です。", "word_order"],
  ["fix", "", "「何を買えばいいかわかりません。」正しい英文は？", ["I don't know what should I buy.", "I don't know what I should buy.", "I don't know I should buy what.", "What I don't know should buy."], 1, "文の途中の疑問詞の後は「主語 ＋ 動詞」の順になります。", "word_order"],
  ["fix", "", "「私は日本の文化に興味があります。」正しい英文は？", ["I am interesting in Japanese culture.", "I am interested in Japanese culture.", "I interested in Japanese culture.", "I am interested Japanese culture in."], 1, "「興味がある」は be interested in ～。interesting は「おもしろい」です。", "vocabulary"],
  ["fix", "", "「私の夢は医者になることです。」正しい英文は？", ["My dream is become a doctor.", "My dream is to become a doctor.", "My dream to become is a doctor.", "My dream is becoming doctor."], 1, "「～すること」は to ＋動詞の原形で表せます。", "grammar"],
  // ── 接続詞 ──
  ["fill", "I like summer ____ I can swim in the sea.", "海で泳げるので夏が好きです。", ["but", "because", "so", "or"], 1, "理由を表すときは because を使います。", "conjunction"],
  ["fill", "It was raining, ____ we stayed home.", "雨が降っていたので、家にいました。", ["because", "but", "so", "if"], 2, "「だから～」と結果を続けるときは so です。", "conjunction"],
  ["fill", "I wanted to go out, ____ I had a lot of homework.", "出かけたかったけれど、宿題がたくさんありました。", ["so", "because", "and", "but"], 3, "反対の内容をつなぐときは but です。", "conjunction"],
  ["fix", "", "正しく理由を書いている文は？", ["Because it is cheap.", "I like it because it is cheap.", "I like it. Because it is cheap and.", "Because cheap, I like."], 1, "Because ～. だけの文は不完全です。主な文とつなげて書きます。", "conjunction"],
  ["fill", "____, smartphones are useful. Second, they are easy to carry.", "第一に、スマートフォンは便利です。第二に、持ち運びやすいです。", ["Finally", "First", "However", "So"], 1, "理由を順番に書くときは First, Second, を使います。", "organization"],
  ["fill", "____, I think students should have part-time jobs.", "これらの理由から、高校生はアルバイトをするべきだと思います。", ["For example", "However", "For these reasons", "First"], 2, "最後に意見をまとめるときは For these reasons, を使います。", "organization"],
  ["fill", "Exercise is good for us. ____, walking every day keeps us healthy.", "運動は体に良いです。たとえば、毎日歩くと健康でいられます。", ["For example", "However", "But", "Because"], 0, "具体例を加えるときは For example, を使います。", "conjunction"],
  ["fill", "Online shopping is convenient. ____, we cannot touch the products.", "ネット通販は便利です。しかし、商品にさわることはできません。", ["Also", "So", "However", "Because"], 2, "前の文と反対の内容を続けるときは However, を使います。", "conjunction"],
  // ── 語彙・表現 ──
  ["fill", "I ____ that school uniforms are a good idea.", "制服は良い考えだと思います。", ["think", "am think", "thinking", "thinks"], 0, "意見は I think (that) ～. で始めます。", "grammar"],
  ["fill", "Students can ____ a lot from volunteer work.", "生徒はボランティア活動から多くを学べます。", ["learns", "learn", "learning", "to learn"], 1, "can の後は動詞の原形です。", "grammar"],
  ["fill", "It is important ____ enough sleep.", "十分に睡眠をとることは大切です。", ["get", "to get", "getting to", "gets"], 1, "It is important to ～ で「～することは大切だ」。", "grammar"],
  ["fill", "Playing games for a long time is bad ____ our eyes.", "長時間ゲームをするのは目に悪いです。", ["to", "for", "at", "with"], 1, "be bad for ～ で「～に悪い」。", "vocabulary"],
  ["fill", "We can ____ money by cooking at home.", "家で料理するとお金を節約できます。", ["save", "keep up", "spend", "lose"], 0, "save money で「お金を節約する」。", "vocabulary"],
  ["fill", "People can ____ information easily on the Internet.", "インターネットで簡単に情報を見つけられます。", ["find", "look", "see at", "watch"], 0, "find information で「情報を見つける」。look は look for ～ の形で使います。", "vocabulary"],
  ["fill", "Smartphones make our lives more ____.", "スマートフォンは私たちの生活をより便利にします。", ["convenience", "convenient", "conveniently", "convene"], 1, "make ～ ＋形容詞 で「～を…にする」。convenient が形容詞です。", "vocabulary"],
  ["fix", "", "質問「Do you think ～?」への答え方として正しいのは？", ["Yes, I think so. Because it is fun.", "I think it is a good idea because it is fun.", "Fun.", "I think, yes good."], 1, "意見は I think ～ の完全な文で、理由と一緒に書きます。", "off_topic"],
  ["fill", "Students should not use smartphones ____ class.", "生徒は授業中にスマートフォンを使うべきではありません。", ["while", "during", "when", "for"], 1, "during ＋名詞 で「～の間に」。while の後は「主語＋動詞」です。", "vocabulary"],
  ["fill", "I want to ____ friends with people from other countries.", "外国の人と友だちになりたいです。", ["do", "make", "have to", "take"], 1, "make friends with ～ で「～と友だちになる」。", "vocabulary"],
];

export const GRAMMAR_DRILLS: GrammarDrill[] = G_ROWS.map(([kind, prompt, promptJp, options, answer, explain, tag], i) => ({
  id: `gr-${String(i + 1).padStart(2, "0")}`,
  kind, prompt, promptJp, options, answer, explain, tag,
}));

type R = [jp: string, sentence: string, explain: string, tag: WeaknessTag];

// 語句は " / " で区切る（正しい順番）
const R_ROWS: R[] = [
  ["私はこの考えに賛成です。", "I / agree / with / this idea.", "agree with ～「～に賛成する」。am は入りません。", "agreement"],
  ["私は生徒が制服を着るべきだと思います。", "I think / students / should / wear / uniforms.", "I think の後に「主語＋動詞」の文を続けます。", "word_order"],
  ["第一に、スマートフォンはとても便利です。", "First, / smartphones / are / very / useful.", "First, で理由1を始めます。", "organization"],
  ["第二に、生徒はお金を節約できます。", "Second, / students / can / save / money.", "can の後は動詞の原形です。", "organization"],
  ["これらの理由から、私は賛成です。", "For these reasons, / I / agree / with / it.", "For these reasons, でまとめます。", "organization"],
  ["私はそれが良い考えだとは思いません。", "I / don't think / it is / a good idea.", "反対意見は I don't think ～ と書くのが自然です。", "word_order"],
  ["海で泳げるので、私は夏が好きです。", "I like / summer / because / I can swim / in the sea.", "because の後に理由の文を続けます。", "conjunction"],
  ["雨だったので、私たちは家にいました。", "It was raining, / so / we / stayed / home.", "so の後に結果を書きます。", "conjunction"],
  ["たとえば、彼らは公園を掃除できます。", "For example, / they / can / clean / parks.", "For example, で具体例を加えます。", "conjunction"],
  ["しかし、それはとても高いです。", "However, / it / is / very / expensive.", "However, で反対の内容を続けます。", "conjunction"],
  ["多くの人が毎日インターネットを使います。", "Many people / use / the Internet / every day.", "時を表す every day は文の最後に置きます。", "word_order"],
  ["彼女はいつも7時に起きます。", "She / always / gets up / at seven.", "always は一般動詞の前に置きます。", "word_order"],
  ["英語を勉強することは大切です。", "It is / important / to study / English.", "It is important to ～。", "grammar"],
  ["私の夢は先生になることです。", "My dream / is / to become / a teacher.", "to ＋動詞の原形で「～すること」。", "grammar"],
  ["子どもは外で遊ぶべきです。", "Children / should / play / outside.", "should の後は動詞の原形です。", "grammar"],
  ["私は去年京都を訪れました。", "I / visited / Kyoto / last year.", "last year があるので過去形です。", "tense"],
  ["将来、多くの人が電子書籍を読むでしょう。", "In the future, / many people / will read / e-books.", "未来は will ＋動詞の原形。", "tense"],
  ["私は3年間テニスをしています。", "I / have played / tennis / for three years.", "続いていることは現在完了で表します。", "tense"],
  ["明日晴れたら、ピクニックに行きます。", "If / it is sunny / tomorrow, / we will go / on a picnic.", "if の中は未来でも現在形です。", "tense"],
  ["私は将来医者になりたいです。", "I want / to be / a doctor / in the future.", "a doctor のように冠詞を忘れずに。", "article"],
  ["彼は毎朝リンゴを1つ食べます。", "He / eats / an apple / every morning.", "apple は母音で始まるので an。", "article"],
  ["私はバスで通学します。", "I / go to school / by bus.", "by bus には冠詞をつけません。", "article"],
  ["私には友だちがたくさんいます。", "I / have / a lot of / friends.", "a lot of の後は複数形です。", "plural"],
  ["多くの子どもがゲームが好きです。", "Many children / like / video games.", "children は child の複数形。", "plural"],
  ["私の兄は毎日サッカーを練習します。", "My brother / practices / soccer / every day.", "主語が3人称単数なので practices。", "agreement"],
  ["それは私たちの生活をより便利にします。", "It / makes / our lives / more convenient.", "make ～ ＋形容詞「～を…にする」。", "vocabulary"],
  ["生徒は授業に集中するべきです。", "Students / should / concentrate / on their classes.", "concentrate on ～「～に集中する」。", "vocabulary"],
  ["家で料理するとお金を節約できます。", "People / can save money / by cooking / at home.", "by ～ing「～することによって」。", "grammar"],
  ["お年寄りは買い物に簡単に行けます。", "Elderly people / can go / shopping / easily.", "go shopping「買い物に行く」。", "vocabulary"],
  ["彼らはたくさんの新しいことを学べます。", "They / can learn / many / new things.", "many ＋形容詞＋名詞の順。", "word_order"],
  ["私は日本の文化に興味があります。", "I am / interested / in / Japanese culture.", "be interested in ～。", "vocabulary"],
  ["それは環境に悪いです。", "It is / bad / for / the environment.", "be bad for ～。the environment は the をつけます。", "article"],
  ["生徒は宿題をする時間がもっと必要です。", "Students / need / more time / to do / their homework.", "time to ～「～する時間」。", "grammar"],
  ["何をすればいいかわかりません。", "I / don't know / what / I should do.", "文の途中の疑問詞の後は「主語＋動詞」。", "word_order"],
  ["私はそれが役に立つと思います。", "I think / it / is / useful.", "it is の is を忘れないように。", "grammar"],
  ["一緒にスポーツを見るのは楽しいです。", "Watching sports / together / is / fun.", "～ing が主語のときは単数扱い（is）。", "agreement"],
  ["私の町には公園が2つあります。", "There are / two parks / in / my town.", "複数なので There are。", "agreement"],
  ["彼女は友だちと話すのが好きです。", "She / likes / talking / with her friends.", "like ～ing「～するのが好き」。", "grammar"],
  ["図書館は勉強するのに良い場所です。", "Libraries / are / good places / to study.", "places to ～「～するための場所」。", "plural"],
  ["スマートフォンは持ち運びが簡単です。", "Smartphones / are / easy / to carry.", "easy to ～「～しやすい」。", "grammar"],
  ["それは多くの人の役に立ちます。", "It / helps / a lot of / people.", "It が主語なので helps。", "agreement"],
  ["私たちはプラスチックの使用を減らすべきです。", "We / should / use / less plastic.", "less ＋数えない名詞「より少ない～」。", "vocabulary"],
  ["彼らは早く寝る必要があります。", "They / need / to go / to bed early.", "need to ～「～する必要がある」。", "grammar"],
  ["私は家族と過ごす時間が好きです。", "I / like / spending time / with my family.", "spend time with ～「～と時間を過ごす」。", "vocabulary"],
  ["毎日運動することは健康に良いです。", "Exercising / every day / is good / for our health.", "～ing の主語は単数扱い。", "agreement"],
  ["私はオンライン授業は良いと思いません。", "I / don't think / online classes / are good.", "online classes は複数なので are。", "agreement"],
  ["生徒は新しい友だちを作れます。", "Students / can make / new / friends.", "make friends「友だちを作る」。", "vocabulary"],
  ["そのため、私は電車で行くほうが好きです。", "So, / I / prefer / going by train.", "prefer ～ing「～するほうを好む」。", "vocabulary"],
  ["多くの事故が運転手のミスで起こります。", "Many accidents / happen / because of / drivers' mistakes.", "because of ＋名詞「～のために」。", "conjunction"],
  ["私はもっと本を読むべきだと思います。", "I think / I / should / read / more books.", "意見は I think で始めます。", "organization"],
];

export const REORDER_DRILLS: ReorderDrill[] = R_ROWS.map(([jp, sentence, explain, tag], i) => ({
  id: `ro-${String(i + 1).padStart(2, "0")}`,
  jp,
  chunks: sentence.split(" / "),
  explain,
  tag,
}));
