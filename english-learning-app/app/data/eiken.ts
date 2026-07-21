// 英検準二級 模擬試験 問題データ（オリジナル作成・英検協会の過去問ではありません）
// 大問1: 語彙・熟語空所補充 10パターン x 15問
// 大問2: 会話文空所補充 10パターン x 5問
// 大問3: 内容一致選択 10パターン x (掲示2問 + Eメール3問 + 説明文5問)

export interface EikenChoiceQuestion {
  options: [string, string, string, string];
  answer: number;
  explain: string;
}

export interface EikenVocabQuestion extends EikenChoiceQuestion {
  text: string;
}

export interface EikenDialogueLine {
  speaker: string;
  text: string;
}

export interface EikenDialogueQuestion extends EikenChoiceQuestion {
  lines: EikenDialogueLine[];
}

export interface EikenReadingItem extends EikenChoiceQuestion {
  text: string;
}

export interface EikenReadingPart {
  title: string;
  passage: string[];
  items: EikenReadingItem[];
}

export interface EikenReadingPattern {
  partA: EikenReadingPart;
  partB: EikenReadingPart;
  partC: EikenReadingPart;
}

export const EIKEN_SECTION1_PATTERNS: EikenVocabQuestion[][] = [
  [
    {
      "text": "My grandmother is going to ____ her 80th birthday next Sunday, so all the family will get together.",
      "options": [
        "celebrate",
        "promise",
        "improve",
        "recognize"
      ],
      "answer": 0,
      "explain": "celebrate = 「祝う」。誕生日を祝うという文脈に合います。"
    },
    {
      "text": "The weather report says it will be cloudy in the morning, but it will ____ up in the afternoon.",
      "options": [
        "crash",
        "clear",
        "count",
        "close"
      ],
      "answer": 1,
      "explain": "clear up = 「（天気が）晴れる」という熟語です。"
    },
    {
      "text": "Because the museum was very crowded, we had to ____ in line for almost thirty minutes.",
      "options": [
        "keep",
        "stay",
        "stand",
        "spend"
      ],
      "answer": 2,
      "explain": "stand in line = 「列に並ぶ」という表現です。"
    },
    {
      "text": "The new student didn't know anyone in class, so Aya kindly ____ him around the school.",
      "options": [
        "said",
        "told",
        "spoke",
        "showed"
      ],
      "answer": 3,
      "explain": "show ~ around = 「〜を案内する」という意味です。"
    },
    {
      "text": "It's dangerous to use your smartphone while ____ a bicycle.",
      "options": [
        "riding",
        "running",
        "walking",
        "driving"
      ],
      "answer": 0,
      "explain": "ride a bicycle = 「自転車に乗る」。driveは車などに使います。"
    },
    {
      "text": "The doctor advised him to ____ more vegetables and less fast food.",
      "options": [
        "buy",
        "eat",
        "cook",
        "grow"
      ],
      "answer": 1,
      "explain": "eat vegetables = 「野菜を食べる」。医師のアドバイスの内容に合います。"
    },
    {
      "text": "Please remember to ____ off the lights before you leave the classroom.",
      "options": [
        "keep",
        "take",
        "turn",
        "put"
      ],
      "answer": 2,
      "explain": "turn off = 「（電気などを）消す」という熟語です。"
    },
    {
      "text": "The concert was so popular that all the tickets were sold ____ within an hour.",
      "options": [
        "down",
        "off",
        "up",
        "out"
      ],
      "answer": 3,
      "explain": "sold out = 「売り切れる」という熟語です。"
    },
    {
      "text": "Ryo was so ____ about the trip to Okinawa that he couldn't sleep the night before.",
      "options": [
        "excited",
        "worried",
        "bored",
        "tired"
      ],
      "answer": 0,
      "explain": "excited = 「わくわくして」。眠れないほど楽しみにしている様子に合います。"
    },
    {
      "text": "If you have any questions about the homework, please feel free to ____ me after class.",
      "options": [
        "say",
        "ask",
        "speak",
        "talk"
      ],
      "answer": 1,
      "explain": "feel free to ask = 「遠慮なく尋ねる」という表現です。"
    },
    {
      "text": "The number of foreign tourists visiting Japan has ____ rapidly over the last ten years.",
      "options": [
        "collected",
        "reduced",
        "increased",
        "disappeared"
      ],
      "answer": 2,
      "explain": "increase = 「増加する」。観光客数の変化を表します。"
    },
    {
      "text": "She was very ____ of her son when he won first prize in the speech contest.",
      "options": [
        "sorry",
        "careful",
        "afraid",
        "proud"
      ],
      "answer": 3,
      "explain": "be proud of ~ = 「〜を誇りに思う」という熟語です。"
    },
    {
      "text": "We need to ____ a decision about the school trip destination by Friday.",
      "options": [
        "make",
        "have",
        "do",
        "take"
      ],
      "answer": 0,
      "explain": "make a decision = 「決定する」という熟語です。"
    },
    {
      "text": "The store is going to ____ a special sale to celebrate its 10th anniversary.",
      "options": [
        "join",
        "hold",
        "visit",
        "open"
      ],
      "answer": 1,
      "explain": "hold a sale = 「セールを開催する」という表現です。"
    },
    {
      "text": "Because he practiced every day, his English speaking skill ____ a lot this year.",
      "options": [
        "continued",
        "borrowed",
        "improved",
        "repeated"
      ],
      "answer": 2,
      "explain": "improve = 「上達する」。毎日練習した結果に合います。"
    }
  ],
  [
    {
      "text": "He decided to ____ up smoking after his daughter asked him to.",
      "options": [
        "give",
        "take",
        "keep",
        "turn"
      ],
      "answer": 0,
      "explain": "give up = 「（習慣などを）やめる」という熟語です。"
    },
    {
      "text": "I'm really ____ forward to seeing my cousins at the summer festival.",
      "options": [
        "waiting",
        "looking",
        "watching",
        "hoping"
      ],
      "answer": 1,
      "explain": "look forward to = 「〜を楽しみにする」という熟語です。"
    },
    {
      "text": "Could you ____ care of my dog while I'm away next week?",
      "options": [
        "hold",
        "make",
        "take",
        "keep"
      ],
      "answer": 2,
      "explain": "take care of = 「〜の世話をする」という熟語です。"
    },
    {
      "text": "My little brother doesn't ____ along with the new kid in his class very well.",
      "options": [
        "go",
        "come",
        "keep",
        "get"
      ],
      "answer": 3,
      "explain": "get along with = 「〜と仲良くやる」という熟語です。"
    },
    {
      "text": "We ____ out of milk this morning, so I had to buy some on the way to school.",
      "options": [
        "ran",
        "went",
        "used",
        "gave"
      ],
      "answer": 0,
      "explain": "run out of = 「〜を使い果たす」という熟語です。"
    },
    {
      "text": "Could you ____ me up from the station at six o'clock?",
      "options": [
        "bring",
        "pick",
        "take",
        "get"
      ],
      "answer": 1,
      "explain": "pick ~ up = 「（人）を車で迎えに行く」という熟語です。"
    },
    {
      "text": "The meeting has been ____ off until next Wednesday because the manager is sick.",
      "options": [
        "set",
        "called",
        "put",
        "given"
      ],
      "answer": 2,
      "explain": "put off = 「延期する」という熟語です。"
    },
    {
      "text": "Success ____ on how much effort you put into your studies.",
      "options": [
        "believes",
        "decides",
        "agrees",
        "depends"
      ],
      "answer": 3,
      "explain": "depend on = 「〜次第である」という熟語です。"
    },
    {
      "text": "All students are expected to ____ part in the school's volunteer day.",
      "options": [
        "take",
        "do",
        "make",
        "join"
      ],
      "answer": 0,
      "explain": "take part in = 「〜に参加する」という熟語です。"
    },
    {
      "text": "The teacher asked us to ____ in our essays by Friday.",
      "options": [
        "turn",
        "hand",
        "give",
        "put"
      ],
      "answer": 1,
      "explain": "hand in = 「提出する」という熟語です。"
    },
    {
      "text": "It took him a while to ____ up with a good title for his story.",
      "options": [
        "make",
        "take",
        "come",
        "get"
      ],
      "answer": 2,
      "explain": "come up with = 「（アイデアなど）を思いつく」という熟語です。"
    },
    {
      "text": "I couldn't ____ out how to fix the printer, so I asked a classmate for help.",
      "options": [
        "hear",
        "watch",
        "feel",
        "figure"
      ],
      "answer": 3,
      "explain": "figure out = 「理解する、解決策を見つける」という熟語です。"
    },
    {
      "text": "It's important to ____ used to a new school little by little.",
      "options": [
        "get",
        "do",
        "keep",
        "give"
      ],
      "answer": 0,
      "explain": "get used to = 「〜に慣れる」という熟語です。"
    },
    {
      "text": "Let's ____ in touch with each other even after we graduate.",
      "options": [
        "do",
        "keep",
        "hold",
        "get"
      ],
      "answer": 1,
      "explain": "keep in touch with = 「連絡を取り合う」という熟語です。"
    },
    {
      "text": "The old washing machine finally ____ down after ten years of use.",
      "options": [
        "threw",
        "fell",
        "broke",
        "felt"
      ],
      "answer": 2,
      "explain": "break down = 「（機械が）故障する」という熟語です。"
    }
  ],
  [
    {
      "text": "It took us almost an hour to ____ up the tent before it got dark.",
      "options": [
        "set",
        "make",
        "build",
        "hold"
      ],
      "answer": 0,
      "explain": "set up = 「（テントなど）を設営する」という熟語です。"
    },
    {
      "text": "The outdoor concert was ____ off because of the heavy rain.",
      "options": [
        "given",
        "called",
        "held",
        "turned"
      ],
      "answer": 1,
      "explain": "call off = 「中止する」という熟語です。"
    },
    {
      "text": "We need to ____ in at the hotel before 6 p.m., or we might lose our room.",
      "options": [
        "sign",
        "turn",
        "check",
        "look"
      ],
      "answer": 2,
      "explain": "check in = 「（ホテルなどに）チェックインする」という熟語です。"
    },
    {
      "text": "Feel free to ____ by my house anytime if you're in the neighborhood.",
      "options": [
        "fall",
        "walk",
        "step",
        "drop"
      ],
      "answer": 3,
      "explain": "drop by = 「ちょっと立ち寄る」という熟語です。"
    },
    {
      "text": "I had to run fast to ____ up with my friends, who had already left.",
      "options": [
        "catch",
        "keep",
        "follow",
        "reach"
      ],
      "answer": 0,
      "explain": "catch up with = 「〜に追いつく」という熟語です。"
    },
    {
      "text": "It took her almost two weeks to ____ over her cold.",
      "options": [
        "go",
        "get",
        "take",
        "pass"
      ],
      "answer": 1,
      "explain": "get over = 「（病気など）から回復する」という熟語です。"
    },
    {
      "text": "Everyone worried about the weather, but the school trip ____ out to be a lot of fun.",
      "options": [
        "showed",
        "ran",
        "turned",
        "kept"
      ],
      "answer": 2,
      "explain": "turn out = 「結局〜になる」という熟語です。"
    },
    {
      "text": "We waited for an hour, but he never ____ up, so we left without him.",
      "options": [
        "stood",
        "went",
        "held",
        "showed"
      ],
      "answer": 3,
      "explain": "show up = 「現れる」という熟語です。"
    },
    {
      "text": "Fasten your seatbelt — the plane is about to ____ off.",
      "options": [
        "take",
        "get",
        "fly",
        "rise"
      ],
      "answer": 0,
      "explain": "take off = 「（飛行機が）離陸する」という熟語です。"
    },
    {
      "text": "I don't know how she can ____ up with her noisy neighbors every night.",
      "options": [
        "come",
        "put",
        "keep",
        "catch"
      ],
      "answer": 1,
      "explain": "put up with = 「〜を我慢する」という熟語です。"
    },
    {
      "text": "If you don't know the meaning of a word, you can ____ it up in a dictionary.",
      "options": [
        "read",
        "find",
        "look",
        "check"
      ],
      "answer": 2,
      "explain": "look up = 「（辞書などで）調べる」という熟語です。"
    },
    {
      "text": "On weekends, I usually ____ out with my classmates at the shopping mall.",
      "options": [
        "stay",
        "go",
        "walk",
        "hang"
      ],
      "answer": 3,
      "explain": "hang out with = 「〜と一緒に過ごす」という熟語です。"
    },
    {
      "text": "The doctor told him to ____ down on sugary drinks for his health.",
      "options": [
        "cut",
        "take",
        "put",
        "get"
      ],
      "answer": 0,
      "explain": "cut down on = 「〜を減らす」という熟語です。"
    },
    {
      "text": "While cleaning my room, I ____ across an old photo of my grandparents.",
      "options": [
        "met",
        "came",
        "found",
        "went"
      ],
      "answer": 1,
      "explain": "come across = 「（偶然）〜を見つける」という熟語です。"
    },
    {
      "text": "The volunteers agreed to ____ out the plan to build a new playground in the park.",
      "options": [
        "turn",
        "give",
        "carry",
        "keep"
      ],
      "answer": 2,
      "explain": "carry out = 「（計画などを）実行する」という熟語です。"
    }
  ],
  [
    {
      "text": "We should ____ a table at the restaurant before we go, since it's always crowded on weekends.",
      "options": [
        "reserve",
        "invite",
        "offer",
        "order"
      ],
      "answer": 0,
      "explain": "reserve = 「予約する」という意味です。"
    },
    {
      "text": "If the shirt doesn't fit, you can ____ it for a different size within seven days.",
      "options": [
        "repair",
        "exchange",
        "return",
        "refund"
      ],
      "answer": 1,
      "explain": "exchange A for B = 「AをBと交換する」という表現です。"
    },
    {
      "text": "Many people decided to ____ money to help the town rebuild after the flood.",
      "options": [
        "lend",
        "spend",
        "donate",
        "borrow"
      ],
      "answer": 2,
      "explain": "donate = 「寄付する」という意味です。"
    },
    {
      "text": "She decided to ____ at the animal shelter every Saturday morning.",
      "options": [
        "apply",
        "join",
        "offer",
        "volunteer"
      ],
      "answer": 3,
      "explain": "volunteer at ~ = 「〜でボランティアをする」という表現です。"
    },
    {
      "text": "Our class is going to ____ a small farewell party for our homeroom teacher.",
      "options": [
        "organize",
        "invite",
        "gather",
        "join"
      ],
      "answer": 0,
      "explain": "organize = 「（催し物などを）企画する」という意味です。"
    },
    {
      "text": "All new employees are required to ____ the orientation meeting before starting work.",
      "options": [
        "hold",
        "attend",
        "visit",
        "watch"
      ],
      "answer": 1,
      "explain": "attend = 「（会議などに）出席する」という意味です。"
    },
    {
      "text": "My sister is going to ____ from high school next spring.",
      "options": [
        "complete",
        "leave",
        "graduate",
        "finish"
      ],
      "answer": 2,
      "explain": "graduate from = 「〜を卒業する」という熟語です。他の語はfromを伴いません。"
    },
    {
      "text": "He worked very hard, and he finally ____ in passing the entrance exam.",
      "options": [
        "achieved",
        "managed",
        "accomplished",
        "succeeded"
      ],
      "answer": 3,
      "explain": "succeed in ~ing = 「〜することに成功する」という表現です。"
    },
    {
      "text": "Even when I make mistakes, my coach always ____ me to keep trying.",
      "options": [
        "encourages",
        "warns",
        "blames",
        "doubts"
      ],
      "answer": 0,
      "explain": "encourage ~ to do = 「〜に…するよう励ます」という表現です。"
    },
    {
      "text": "Her speech ____ many students to start volunteering in their community.",
      "options": [
        "respected",
        "inspired",
        "impressed",
        "admired"
      ],
      "answer": 1,
      "explain": "inspire ~ to do = 「〜が…する気にさせる」という表現です。"
    },
    {
      "text": "You should ____ eating too much junk food if you want to stay healthy.",
      "options": [
        "keep",
        "protect",
        "avoid",
        "prevent"
      ],
      "answer": 2,
      "explain": "avoid ~ing = 「〜することを避ける」という表現です。"
    },
    {
      "text": "I felt very ____ before my job interview, but I did my best to stay calm.",
      "options": [
        "confident",
        "curious",
        "jealous",
        "nervous"
      ],
      "answer": 3,
      "explain": "nervous = 「緊張して」という意味です。"
    },
    {
      "text": "I'm really ____ for all the support you've given me this year.",
      "options": [
        "grateful",
        "generous",
        "curious",
        "cheerful"
      ],
      "answer": 0,
      "explain": "grateful = 「感謝している」という意味です。be grateful for ~。"
    },
    {
      "text": "She was ____ when she found out the concert had been canceled.",
      "options": [
        "ashamed",
        "disappointed",
        "embarrassed",
        "jealous"
      ],
      "answer": 1,
      "explain": "disappointed = 「がっかりして」という意味です。"
    },
    {
      "text": "My phone is old, but it's still very ____ — it has never broken down once.",
      "options": [
        "affordable",
        "spacious",
        "reliable",
        "convenient"
      ],
      "answer": 2,
      "explain": "reliable = 「信頼できる」という意味です。"
    }
  ],
  [
    {
      "text": "Please make sure to label your ____ before checking it in at the airport.",
      "options": [
        "luggage",
        "passport",
        "ticket",
        "receipt"
      ],
      "answer": 0,
      "explain": "luggage = 「（旅行の）荷物」という意味です。"
    },
    {
      "text": "I made a ____ for two people at that new Italian restaurant.",
      "options": [
        "refund",
        "reservation",
        "receipt",
        "discount"
      ],
      "answer": 1,
      "explain": "reservation = 「予約」という意味です。make a reservation。"
    },
    {
      "text": "The ____ for the essay contest is next Friday, so you still have time.",
      "options": [
        "timetable",
        "destination",
        "deadline",
        "schedule"
      ],
      "answer": 2,
      "explain": "deadline = 「締め切り」という意味です。"
    },
    {
      "text": "Students can get a 20 percent ____ on movie tickets with their student ID.",
      "options": [
        "refund",
        "receipt",
        "deposit",
        "discount"
      ],
      "answer": 3,
      "explain": "discount = 「割引」という意味です。"
    },
    {
      "text": "You will need five ____ to make this simple pasta dish.",
      "options": [
        "ingredients",
        "recipes",
        "instructions",
        "portions"
      ],
      "answer": 0,
      "explain": "ingredient = 「材料」という意味です。"
    },
    {
      "text": "Please read the ____ carefully before you turn on the machine.",
      "options": [
        "receipts",
        "instructions",
        "destinations",
        "ingredients"
      ],
      "answer": 1,
      "explain": "instructions = 「使用説明」という意味です。"
    },
    {
      "text": "Kyoto is a popular ____ for tourists who want to see traditional temples.",
      "options": [
        "instruction",
        "deadline",
        "destination",
        "ingredient"
      ],
      "answer": 2,
      "explain": "destination = 「目的地」という意味です。"
    },
    {
      "text": "The train to Osaka will leave from ____ 3 in ten minutes.",
      "options": [
        "destination",
        "timetable",
        "ticket",
        "platform"
      ],
      "answer": 3,
      "explain": "platform = 「（駅の）ホーム」という意味です。"
    },
    {
      "text": "Could you check the bus ____ to see what time the last bus leaves?",
      "options": [
        "timetable",
        "deadline",
        "reservation",
        "receipt"
      ],
      "answer": 0,
      "explain": "timetable = 「時刻表」という意味です。"
    },
    {
      "text": "The art museum is holding a special ____ of paintings from local students.",
      "options": [
        "competition",
        "exhibition",
        "performance",
        "rehearsal"
      ],
      "answer": 1,
      "explain": "exhibition = 「展示会」という意味です。"
    },
    {
      "text": "The ____ clapped loudly when the singer finished her final song.",
      "options": [
        "competition",
        "championship",
        "audience",
        "performance"
      ],
      "answer": 2,
      "explain": "audience = 「観客」という意味です。"
    },
    {
      "text": "The drama club had one last ____ before the actual performance on stage.",
      "options": [
        "exhibition",
        "championship",
        "audience",
        "rehearsal"
      ],
      "answer": 3,
      "explain": "rehearsal = 「（本番前の）リハーサル」という意味です。"
    },
    {
      "text": "Our basketball team will face a really strong ____ in tomorrow's final match.",
      "options": [
        "opponent",
        "referee",
        "uniform",
        "audience"
      ],
      "answer": 0,
      "explain": "opponent = 「対戦相手」という意味です。"
    },
    {
      "text": "The school gym needs new sports ____ , such as balls and nets.",
      "options": [
        "instruction",
        "equipment",
        "uniform",
        "ingredient"
      ],
      "answer": 1,
      "explain": "equipment = 「用具、器具」という意味です。"
    },
    {
      "text": "If you have any ____ of a cold, such as a fever, you should stay home and rest.",
      "options": [
        "prescriptions",
        "patients",
        "symptoms",
        "treatments"
      ],
      "answer": 2,
      "explain": "symptom = 「症状」という意味です。"
    }
  ],
  [
    {
      "text": "The weather ____ got colder as autumn turned into winter.",
      "options": [
        "gradually",
        "suddenly",
        "immediately",
        "rarely"
      ],
      "answer": 0,
      "explain": "gradually = 「徐々に」という意味です。季節の変化に合います。"
    },
    {
      "text": "It was sunny all morning, but it ____ started raining just before lunch.",
      "options": [
        "eventually",
        "suddenly",
        "gradually",
        "occasionally"
      ],
      "answer": 1,
      "explain": "suddenly = 「突然」という意味です。"
    },
    {
      "text": "He practiced the piano every day, and he ____ became good enough to perform in public.",
      "options": [
        "rarely",
        "hardly",
        "eventually",
        "suddenly"
      ],
      "answer": 2,
      "explain": "eventually = 「最終的に、やがて」という意味です。"
    },
    {
      "text": "I usually walk to school, but I ____ take the bus when it rains heavily.",
      "options": [
        "constantly",
        "frequently",
        "always",
        "occasionally"
      ],
      "answer": 3,
      "explain": "occasionally = 「時々」という意味です。普段は歩くという文脈との対比に合います。"
    },
    {
      "text": "I ____ want to visit Australia someday — it's my dream destination.",
      "options": [
        "definitely",
        "hardly",
        "rarely",
        "barely"
      ],
      "answer": 0,
      "explain": "definitely = 「間違いなく、絶対に」という意味です。"
    },
    {
      "text": "It's cloudy outside, so it will ____ rain later this evening.",
      "options": [
        "barely",
        "probably",
        "hardly",
        "rarely"
      ],
      "answer": 1,
      "explain": "probably = 「おそらく」という意味です。"
    },
    {
      "text": "I enjoy all kinds of music, ____ jazz and classical.",
      "options": [
        "rarely",
        "barely",
        "especially",
        "hardly"
      ],
      "answer": 2,
      "explain": "especially = 「特に」という意味です。"
    },
    {
      "text": "It began to rain heavily, but ____ , I had brought my umbrella.",
      "options": [
        "unfortunately",
        "hardly",
        "rarely",
        "fortunately"
      ],
      "answer": 3,
      "explain": "fortunately = 「幸運にも」という意味です。"
    },
    {
      "text": "I really wanted to join the trip, but ____ , I had to work that weekend.",
      "options": [
        "unfortunately",
        "fortunately",
        "definitely",
        "probably"
      ],
      "answer": 0,
      "explain": "unfortunately = 「残念ながら」という意味です。"
    },
    {
      "text": "We should all try to ____ the environment by using less plastic.",
      "options": [
        "damage",
        "protect",
        "pollute",
        "waste"
      ],
      "answer": 1,
      "explain": "protect = 「守る、保護する」という意味です。"
    },
    {
      "text": "Turning off lights when you leave a room can help ____ electricity use.",
      "options": [
        "waste",
        "produce",
        "reduce",
        "increase"
      ],
      "answer": 2,
      "explain": "reduce = 「減らす」という意味です。"
    },
    {
      "text": "Please ____ these plastic bottles instead of throwing them in the regular trash.",
      "options": [
        "pollute",
        "waste",
        "collect",
        "recycle"
      ],
      "answer": 3,
      "explain": "recycle = 「リサイクルする」という意味です。"
    },
    {
      "text": "Air ____ in the city has become a serious problem in recent years.",
      "options": [
        "pollution",
        "population",
        "temperature",
        "climate"
      ],
      "answer": 0,
      "explain": "pollution = 「汚染」という意味です。"
    },
    {
      "text": "The ____ of this small town has been decreasing for the past twenty years.",
      "options": [
        "climate",
        "population",
        "pollution",
        "temperature"
      ],
      "answer": 1,
      "explain": "population = 「人口」という意味です。"
    },
    {
      "text": "Scientists say the world's ____ is changing faster than expected.",
      "options": [
        "pollution",
        "temperature",
        "climate",
        "population"
      ],
      "answer": 2,
      "explain": "climate = 「気候」という意味です。climate changeという表現でよく使われます。"
    }
  ],
  [
    {
      "text": "The nurse gave him some medicine to help him ____ from his headache.",
      "options": [
        "recover",
        "injure",
        "damage",
        "exhaust"
      ],
      "answer": 0,
      "explain": "recover from ~ = 「〜から回復する」という表現です。"
    },
    {
      "text": "After the long hiking trip, everyone was completely ____ and went to bed early.",
      "options": [
        "embarrassed",
        "exhausted",
        "curious",
        "jealous"
      ],
      "answer": 1,
      "explain": "exhausted = 「疲れ果てて」という意味です。"
    },
    {
      "text": "After months of practice, she felt much more ____ about speaking in front of a large audience.",
      "options": [
        "curious",
        "ashamed",
        "confident",
        "nervous"
      ],
      "answer": 2,
      "explain": "confident = 「自信がある」という意味です。"
    },
    {
      "text": "My little sister is very ____ about how airplanes can fly.",
      "options": [
        "jealous",
        "embarrassed",
        "ashamed",
        "curious"
      ],
      "answer": 3,
      "explain": "curious = 「好奇心がある」という意味です。"
    },
    {
      "text": "He felt a little ____ when his friend got a new video game console for his birthday.",
      "options": [
        "jealous",
        "curious",
        "confident",
        "relieved"
      ],
      "answer": 0,
      "explain": "jealous = 「うらやましく思う」という意味です。"
    },
    {
      "text": "I felt so ____ when I called my teacher \"Mom\" by mistake in front of the whole class.",
      "options": [
        "cheerful",
        "embarrassed",
        "relieved",
        "grateful"
      ],
      "answer": 1,
      "explain": "embarrassed = 「恥ずかしい」という意味です。"
    },
    {
      "text": "I was so ____ when I found out I had passed the math test.",
      "options": [
        "embarrassed",
        "curious",
        "relieved",
        "jealous"
      ],
      "answer": 2,
      "explain": "relieved = 「安心して」という意味です。"
    },
    {
      "text": "It's ____ to say \"thank you\" when someone helps you.",
      "options": [
        "rude",
        "careless",
        "patient",
        "polite"
      ],
      "answer": 3,
      "explain": "polite = 「礼儀正しい」という意味です。"
    },
    {
      "text": "It's considered ____ to talk loudly on your phone on a quiet train.",
      "options": [
        "rude",
        "polite",
        "patient",
        "generous"
      ],
      "answer": 0,
      "explain": "rude = 「失礼な」という意味です。"
    },
    {
      "text": "You need to be ____ with young children, since they take time to learn new things.",
      "options": [
        "jealous",
        "patient",
        "careless",
        "rude"
      ],
      "answer": 1,
      "explain": "patient = 「忍耐強い」という意味です。"
    },
    {
      "text": "It was ____ of him to leave his phone on the train seat.",
      "options": [
        "polite",
        "generous",
        "careless",
        "patient"
      ],
      "answer": 2,
      "explain": "careless = 「不注意な」という意味です。"
    },
    {
      "text": "It was very ____ of her to donate half of her prize money to charity.",
      "options": [
        "careless",
        "rude",
        "curious",
        "generous"
      ],
      "answer": 3,
      "explain": "generous = 「気前がよい」という意味です。"
    },
    {
      "text": "The train was so ____ this morning that I couldn't even move my arms.",
      "options": [
        "crowded",
        "spacious",
        "comfortable",
        "convenient"
      ],
      "answer": 0,
      "explain": "crowded = 「混雑した」という意味です。"
    },
    {
      "text": "It's very ____ to have a convenience store right in front of the station.",
      "options": [
        "fragile",
        "convenient",
        "spacious",
        "crowded"
      ],
      "answer": 1,
      "explain": "convenient = 「便利な」という意味です。"
    },
    {
      "text": "My teacher is always ____ ; she has never been late to class once.",
      "options": [
        "generous",
        "curious",
        "punctual",
        "patient"
      ],
      "answer": 2,
      "explain": "punctual = 「時間を守る」という意味です。"
    }
  ],
  [
    {
      "text": "My neighbor always ____ about the noise from our garden, even though we're not that loud.",
      "options": [
        "complains",
        "discusses",
        "mentions",
        "describes"
      ],
      "answer": 0,
      "explain": "complain about ~ = 「〜について不平を言う」という表現です。他の動詞はaboutを伴いません。"
    },
    {
      "text": "My doctor ____ me to get more sleep every night.",
      "options": [
        "mentioned",
        "advised",
        "suggested",
        "recommended"
      ],
      "answer": 1,
      "explain": "advise ~ to do = 「〜に…するよう助言する」という表現です。suggestやrecommendはこの形をとりません。"
    },
    {
      "text": "This song always ____ me of my summer vacation in Okinawa.",
      "options": [
        "remembers",
        "recalls",
        "reminds",
        "memorizes"
      ],
      "answer": 2,
      "explain": "remind ~ of … = 「〜に…を思い出させる」という表現です。"
    },
    {
      "text": "In an emergency, you can always ____ on your family for help.",
      "options": [
        "believe",
        "trust",
        "agree",
        "rely"
      ],
      "answer": 3,
      "explain": "rely on = 「〜に頼る」という表現です。"
    },
    {
      "text": "Everyone in the group ____ to the success of the school festival.",
      "options": [
        "contributed",
        "participated",
        "belonged",
        "agreed"
      ],
      "answer": 0,
      "explain": "contribute to ~ = 「〜に貢献する」という表現です。"
    },
    {
      "text": "The teacher kindly ____ out my mistakes so I could correct them.",
      "options": [
        "said",
        "pointed",
        "showed",
        "told"
      ],
      "answer": 1,
      "explain": "point out = 「指摘する」という熟語です。"
    },
    {
      "text": "More than 200 students ____ in the charity walk last weekend.",
      "options": [
        "entered",
        "belonged",
        "participated",
        "attended"
      ],
      "answer": 2,
      "explain": "participate in = 「〜に参加する」という熟語です。"
    },
    {
      "text": "The principal will ____ the winners of the speech contest during the assembly.",
      "options": [
        "describe",
        "discuss",
        "suggest",
        "announce"
      ],
      "answer": 3,
      "explain": "announce = 「発表する」という意味です。"
    },
    {
      "text": "He decided to ____ to his friend for being late to the meeting.",
      "options": [
        "apologize",
        "complain",
        "argue",
        "blame"
      ],
      "answer": 0,
      "explain": "apologize to ~ for … = 「…のことで〜に謝る」という表現です。"
    },
    {
      "text": "Could I ____ your dictionary for a minute? I forgot mine at home.",
      "options": [
        "loan",
        "borrow",
        "lend",
        "rent"
      ],
      "answer": 1,
      "explain": "borrow = 「（人から）借りる」という意味です。lendは逆に「貸す」という意味なので注意。"
    },
    {
      "text": "Could you ____ me some money? I'll pay you back tomorrow, I promise.",
      "options": [
        "rent",
        "owe",
        "lend",
        "borrow"
      ],
      "answer": 2,
      "explain": "lend = 「貸す」という意味です。borrowは逆に「借りる」という意味です。"
    },
    {
      "text": "Ten schools from the city will ____ in the swimming championship next month.",
      "options": [
        "oppose",
        "challenge",
        "argue",
        "compete"
      ],
      "answer": 3,
      "explain": "compete in ~ = 「〜で競う」という表現です。"
    },
    {
      "text": "Thanks to her hard work, she was finally able to ____ her goal of becoming a nurse.",
      "options": [
        "achieve",
        "complete",
        "success",
        "improve"
      ],
      "answer": 0,
      "explain": "achieve a goal = 「目標を達成する」という表現です。"
    },
    {
      "text": "It's amazing that these old trees have ____ for more than five hundred years.",
      "options": [
        "recovered",
        "survived",
        "rescued",
        "protected"
      ],
      "answer": 1,
      "explain": "survive = 「生き延びる」という意味です。"
    },
    {
      "text": "My part-time job has ____ hours, so I can choose which days to work.",
      "options": [
        "rude",
        "crowded",
        "flexible",
        "careless"
      ],
      "answer": 2,
      "explain": "flexible = 「融通のきく」という意味です。"
    }
  ],
  [
    {
      "text": "My grandmother gave me a ____ scarf that she knitted herself.",
      "options": [
        "handmade",
        "secondhand",
        "spoiled",
        "fragile"
      ],
      "answer": 0,
      "explain": "handmade = 「手作りの」という意味です。"
    },
    {
      "text": "I bought this ____ bike at a small shop near my house; it was much cheaper than a new one.",
      "options": [
        "precious",
        "secondhand",
        "handmade",
        "valuable"
      ],
      "answer": 1,
      "explain": "secondhand = 「中古の」という意味です。"
    },
    {
      "text": "This old watch is very ____ to me because it belonged to my father.",
      "options": [
        "spoiled",
        "affordable",
        "valuable",
        "fragile"
      ],
      "answer": 2,
      "explain": "valuable = 「大切な、価値のある」という意味です。"
    },
    {
      "text": "Please handle this box carefully — the glass items inside are very ____.",
      "options": [
        "valuable",
        "spoiled",
        "affordable",
        "fragile"
      ],
      "answer": 3,
      "explain": "fragile = 「壊れやすい」という意味です。"
    },
    {
      "text": "We found a small hotel near the beach that was surprisingly ____ , so we could stay a whole week without spending too much.",
      "options": [
        "affordable",
        "spacious",
        "fragile",
        "crowded"
      ],
      "answer": 0,
      "explain": "affordable = 「手頃な価格の」という意味です。"
    },
    {
      "text": "Don't eat that milk — it smells like it has ____ already.",
      "options": [
        "exchanged",
        "spoiled",
        "recycled",
        "donated"
      ],
      "answer": 1,
      "explain": "spoil = 「（食べ物が）腐る」という意味です。has spoiledで「腐ってしまった」。"
    },
    {
      "text": "My mother always makes sure our meals are ____ , not just delicious, so she adds plenty of vegetables and protein.",
      "options": [
        "fresh",
        "spoiled",
        "nutritious",
        "delicious"
      ],
      "answer": 2,
      "explain": "nutritious = 「栄養のある」という意味です。"
    },
    {
      "text": "The vegetables at this farmer's market are always ____ because they're picked the same morning.",
      "options": [
        "spoiled",
        "nutritious",
        "handmade",
        "fresh"
      ],
      "answer": 3,
      "explain": "fresh = 「新鮮な」という意味です。"
    },
    {
      "text": "Their new apartment is much more ____ than their old one, with two large bedrooms.",
      "options": [
        "spacious",
        "crowded",
        "convenient",
        "affordable"
      ],
      "answer": 0,
      "explain": "spacious = 「広々とした」という意味です。"
    },
    {
      "text": "These new running shoes are so ____ that I forget I'm even wearing them.",
      "options": [
        "reliable",
        "comfortable",
        "spacious",
        "convenient"
      ],
      "answer": 1,
      "explain": "comfortable = 「快適な」という意味です。"
    },
    {
      "text": "Everyone at the party said the homemade cake was absolutely ____.",
      "options": [
        "fresh",
        "spoiled",
        "delicious",
        "nutritious"
      ],
      "answer": 2,
      "explain": "delicious = 「とても美味しい」という意味です。"
    },
    {
      "text": "You need to pay a monthly fee to keep your gym ____ active.",
      "options": [
        "reservation",
        "discount",
        "deposit",
        "membership"
      ],
      "answer": 3,
      "explain": "membership = 「会員資格」という意味です。"
    },
    {
      "text": "The students organized a bake sale to raise money for a local ____.",
      "options": [
        "charity",
        "discount",
        "reservation",
        "membership"
      ],
      "answer": 0,
      "explain": "charity = 「慈善団体」という意味です。"
    },
    {
      "text": "The dance club's ____ at the school festival received a huge round of applause.",
      "options": [
        "competition",
        "performance",
        "rehearsal",
        "exhibition"
      ],
      "answer": 1,
      "explain": "performance = 「（本番の）発表、公演」という意味です。"
    },
    {
      "text": "Our soccer team has won the city ____ three years in a row.",
      "options": [
        "referee",
        "equipment",
        "championship",
        "opponent"
      ],
      "answer": 2,
      "explain": "championship = 「選手権」という意味です。"
    }
  ],
  [
    {
      "text": "My friend ____ this restaurant to me, and it turned out to be delicious.",
      "options": [
        "recommended",
        "described",
        "mentioned",
        "admired"
      ],
      "answer": 0,
      "explain": "recommend A to B = 「AをBに勧める」という表現です。"
    },
    {
      "text": "Can you ____ what the lost bag looked like to the station staff?",
      "options": [
        "explain",
        "describe",
        "mention",
        "express"
      ],
      "answer": 1,
      "explain": "describe = 「（外見などを）説明する、描写する」という意味です。"
    },
    {
      "text": "It's sometimes hard to ____ your feelings in a foreign language.",
      "options": [
        "mention",
        "declare",
        "express",
        "describe"
      ],
      "answer": 2,
      "explain": "express = 「（気持ちなどを）表現する」という意味です。"
    },
    {
      "text": "Don't ____ yourself for the mistake — anyone could have done the same thing.",
      "options": [
        "apologize",
        "complain",
        "argue",
        "blame"
      ],
      "answer": 3,
      "explain": "blame oneself = 「自分を責める」という表現です。他の動詞はyourselfを直接目的語に取りません。"
    },
    {
      "text": "The sign ____ visitors not to feed the animals at the zoo.",
      "options": [
        "warns",
        "suggests",
        "recommends",
        "mentions"
      ],
      "answer": 0,
      "explain": "warn ~ to do = 「〜に…するよう警告する」という表現です。他の動詞はこの形をとりません。"
    },
    {
      "text": "It took a while, but she finally ____ her parents to let her study abroad.",
      "options": [
        "mentioned",
        "persuaded",
        "suggested",
        "recommended"
      ],
      "answer": 1,
      "explain": "persuade ~ to do = 「〜を説得して…させる」という表現です。"
    },
    {
      "text": "He finally ____ that he had broken the window, even though no one saw him do it.",
      "options": [
        "argued",
        "complained",
        "admitted",
        "denied"
      ],
      "answer": 2,
      "explain": "admit = 「（悪いことを）認める」という意味です。"
    },
    {
      "text": "She ____ eating the last piece of cake, but there was chocolate on her hands.",
      "options": [
        "admitted",
        "agreed",
        "confessed",
        "denied"
      ],
      "answer": 3,
      "explain": "deny = 「否定する」という意味です。butの前後の矛盾から判断します。"
    },
    {
      "text": "After days of feeling guilty, he decided to ____ to his teacher that he had copied the homework.",
      "options": [
        "confess",
        "deny",
        "argue",
        "complain"
      ],
      "answer": 0,
      "explain": "confess = 「（罪などを）告白する」という意味です。"
    },
    {
      "text": "I have a dentist ____ at three o'clock, so I need to leave work early today.",
      "options": [
        "membership",
        "appointment",
        "reservation",
        "deadline"
      ],
      "answer": 1,
      "explain": "appointment = 「（病院などの）予約」という意味です。"
    },
    {
      "text": "Keep the ____ in case you need to return or exchange the item later.",
      "options": [
        "discount",
        "deposit",
        "receipt",
        "refund"
      ],
      "answer": 2,
      "explain": "receipt = 「領収書、レシート」という意味です。"
    },
    {
      "text": "Since the product was broken, the store gave me a full ____.",
      "options": [
        "receipt",
        "discount",
        "deposit",
        "refund"
      ],
      "answer": 3,
      "explain": "refund = 「返金」という意味です。"
    },
    {
      "text": "You need to pay a small ____ to reserve the hotel room, and the rest later.",
      "options": [
        "deposit",
        "refund",
        "receipt",
        "discount"
      ],
      "answer": 0,
      "explain": "deposit = 「（予約金などの）内金」という意味です。"
    },
    {
      "text": "The hospital offers free ____ for children under the age of six.",
      "options": [
        "patient",
        "treatment",
        "symptom",
        "prescription"
      ],
      "answer": 1,
      "explain": "treatment = 「治療」という意味です。"
    },
    {
      "text": "The doctor gave her a ____ for some medicine to help with her cough.",
      "options": [
        "deposit",
        "membership",
        "prescription",
        "receipt"
      ],
      "answer": 2,
      "explain": "prescription = 「処方箋」という意味です。"
    }
  ]
];

export const EIKEN_SECTION2_PATTERNS: EikenDialogueQuestion[][] = [
  [
    {
      "lines": [
        {
          "speaker": "Woman",
          "text": "Excuse me, could you tell me how to get to the city library?"
        },
        {
          "speaker": "Man",
          "text": "____ It's about a five-minute walk from here."
        },
        {
          "speaker": "Woman",
          "text": "Thank you so much."
        }
      ],
      "options": [
        "Sure. Go straight and turn left at the second corner.",
        "Sorry, I don't have any money with me.",
        "Yes, I've already read that book.",
        "No, the library is closed on Mondays."
      ],
      "answer": 0,
      "explain": "「〜まで徒歩5分です」と道順を答えている1が自然な流れです。"
    },
    {
      "lines": [
        {
          "speaker": "Son",
          "text": "Mom, can I watch TV after dinner?"
        },
        {
          "speaker": "Mother",
          "text": "____ You still have homework to finish."
        },
        {
          "speaker": "Son",
          "text": "OK, I'll do it right after we eat."
        }
      ],
      "options": [
        "Sure, go ahead.",
        "I'm afraid not.",
        "That sounds fun.",
        "I have no idea."
      ],
      "answer": 1,
      "explain": "宿題が残っていることを理由に断る流れなので2が適切です。"
    },
    {
      "lines": [
        {
          "speaker": "Clerk",
          "text": "Would you like to try this jacket on before you buy it?"
        },
        {
          "speaker": "Customer",
          "text": "____ Where is the fitting room?"
        },
        {
          "speaker": "Clerk",
          "text": "It's right over there, next to the mirror."
        }
      ],
      "options": [
        "No, thank you. I'm just looking.",
        "I already paid for it.",
        "Yes, I'd like to.",
        "That's too expensive for me."
      ],
      "answer": 2,
      "explain": "試着室の場所を尋ねているので、まず「着てみたい」と答える3が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Tom",
          "text": "Are you coming to the school festival this Saturday?"
        },
        {
          "speaker": "Ami",
          "text": "____ I promised to help my sister move to her new apartment."
        },
        {
          "speaker": "Tom",
          "text": "Oh, that's too bad. I hope it goes well."
        }
      ],
      "options": [
        "I've already been there twice.",
        "Yes, I'll bring my camera.",
        "Of course, I can't wait.",
        "I'm afraid I can't."
      ],
      "answer": 3,
      "explain": "お姉さんの引っ越しを手伝う予定があるため、誘いを断る2が適切です。"
    },
    {
      "lines": [
        {
          "speaker": "Waiter",
          "text": "Are you ready to order, or do you need a few more minutes?"
        },
        {
          "speaker": "Customer",
          "text": "____ Could I have the grilled chicken and a small salad?"
        },
        {
          "speaker": "Waiter",
          "text": "Sure. Anything to drink?"
        }
      ],
      "options": [
        "I think we're ready now.",
        "I'd like to pay by credit card.",
        "I need a few more minutes, thanks.",
        "I'm not very hungry today."
      ],
      "answer": 0,
      "explain": "直後に注文内容を伝えているので、「もう決まりました」という3が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Student",
          "text": "I have a stomachache. Can I go to the nurse's office?"
        },
        {
          "speaker": "Teacher",
          "text": "____ Do you want someone to go with you?"
        },
        {
          "speaker": "Student",
          "text": "No, thank you. I think I can go by myself."
        }
      ],
      "options": [
        "Of course. Take your time.",
        "No, you can't leave during class.",
        "I don't have any medicine.",
        "Yes, I broke my arm yesterday."
      ],
      "answer": 0,
      "explain": "体調不良を伝えた生徒に許可を与え、付き添いを尋ねる流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Mika",
          "text": "Hi, it's Mika. Is Yuto there?"
        },
        {
          "speaker": "Yuto's mother",
          "text": "____ He's taking a shower right now."
        },
        {
          "speaker": "Mika",
          "text": "OK, I'll call back in about twenty minutes."
        }
      ],
      "options": [
        "He's not home at the moment.",
        "Sorry, he's a little busy right now.",
        "Yes, he's right here.",
        "No, he already left for school."
      ],
      "answer": 1,
      "explain": "「シャワー中」と続く理由に合う「取り込み中」の2が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Receptionist",
          "text": "Good morning. Do you have an appointment today?"
        },
        {
          "speaker": "Patient",
          "text": "____ Could I still see the doctor?"
        },
        {
          "speaker": "Receptionist",
          "text": "Let me check. We might be able to fit you in around 11."
        }
      ],
      "options": [
        "I already saw the doctor yesterday.",
        "Yes, I made one last week.",
        "No, but this is an emergency.",
        "I'm sorry, I don't have any pain."
      ],
      "answer": 2,
      "explain": "予約がない状況で診察を頼んでいる流れなので2が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Passenger",
          "text": "Excuse me, how much is a ticket to Yokohama Station?"
        },
        {
          "speaker": "Staff",
          "text": "____ Are you going one way or round trip?"
        },
        {
          "speaker": "Passenger",
          "text": "One way, please."
        }
      ],
      "options": [
        "The station is two stops from here.",
        "It's about 300 yen for a one-way ticket.",
        "The train leaves every ten minutes.",
        "That depends on which ticket you need."
      ],
      "answer": 3,
      "explain": "料金を聞かれた後、片道か往復かを聞き返す流れなので3が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Manager",
          "text": "So, why do you want to work at this café?"
        },
        {
          "speaker": "Applicant",
          "text": "____ I also love talking with customers."
        },
        {
          "speaker": "Manager",
          "text": "That's great to hear. When can you start?"
        }
      ],
      "options": [
        "I really enjoy making coffee.",
        "I don't drink coffee at all.",
        "My friend told me not to apply.",
        "I'm not sure why I applied here."
      ],
      "answer": 0,
      "explain": "「お客様と話すのも好き」と自然につながる2が正解です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Staff",
          "text": "May I see your passport and ticket, please?"
        },
        {
          "speaker": "Traveler",
          "text": "____ Here you are."
        },
        {
          "speaker": "Staff",
          "text": "Thank you. Would you like a window or an aisle seat?"
        }
      ],
      "options": [
        "Sure, just a moment.",
        "I already checked in online.",
        "I don't have any luggage.",
        "I'm afraid I lost them."
      ],
      "answer": 0,
      "explain": "提示する前の一言として「少々お待ちください」の2が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Guest",
          "text": "Hi, I have a reservation under the name Sato."
        },
        {
          "speaker": "Clerk",
          "text": "____ Could you fill out this form, please?"
        },
        {
          "speaker": "Guest",
          "text": "Sure, no problem."
        }
      ],
      "options": [
        "I'm sorry, we're fully booked tonight.",
        "Let me check... yes, I've found it.",
        "Checkout time is at eleven tomorrow.",
        "You can pay with a credit card."
      ],
      "answer": 1,
      "explain": "予約名を確認できたことを伝える2が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Clerk",
          "text": "Hi there, what can I get for you today?"
        },
        {
          "speaker": "Customer",
          "text": "____ Also, could I get that to go?"
        },
        {
          "speaker": "Clerk",
          "text": "Sure, that'll be ready in a few minutes."
        }
      ],
      "options": [
        "I already had lunch, thanks.",
        "I forgot my wallet at home.",
        "I'd like a small iced coffee, please.",
        "I think the coffee here is too strong."
      ],
      "answer": 2,
      "explain": "「持ち帰りで」に自然につながる注文内容の1が正解です。"
    },
    {
      "lines": [
        {
          "speaker": "Visitor",
          "text": "Two adult tickets, please. Is there a discount for students?"
        },
        {
          "speaker": "Staff",
          "text": "____ Do you have your student ID with you?"
        },
        {
          "speaker": "Visitor",
          "text": "Yes, right here."
        }
      ],
      "options": [
        "The exhibition ends next week.",
        "Tickets are not available online.",
        "Sorry, the museum is closed today.",
        "Yes, students get 20 percent off."
      ],
      "answer": 3,
      "explain": "学割を答え、学生証の提示を求める流れなので2が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Coach",
          "text": "You look tired today. Are you feeling all right?"
        },
        {
          "speaker": "Player",
          "text": "____ I stayed up late studying for a test."
        },
        {
          "speaker": "Coach",
          "text": "I see. Let's take it easy in today's practice, then."
        }
      ],
      "options": [
        "Actually, I didn't get much sleep.",
        "No, I feel great today.",
        "I forgot we had practice today.",
        "Yes, I slept really well last night."
      ],
      "answer": 0,
      "explain": "「夜更かしした」と続く理由に合う2が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Tourist",
          "text": "Excuse me, is there a post office near here?"
        },
        {
          "speaker": "Local",
          "text": "____ It's right next to the bank."
        },
        {
          "speaker": "Tourist",
          "text": "Thank you very much."
        }
      ],
      "options": [
        "Yes, there's one just around the corner.",
        "No, I've never been there before.",
        "Sorry, I don't need any stamps.",
        "The bank closes at five o'clock."
      ],
      "answer": 0,
      "explain": "直後に場所の説明が続くので、存在を肯定する1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Librarian",
          "text": "I'm sorry, but this book is already three days overdue."
        },
        {
          "speaker": "Student",
          "text": "____ Can I renew it for another week?"
        },
        {
          "speaker": "Librarian",
          "text": "Sure, as long as no one else has reserved it."
        }
      ],
      "options": [
        "I already returned it yesterday.",
        "Oh, I didn't realize that.",
        "I don't have a library card.",
        "I haven't started reading it yet."
      ],
      "answer": 1,
      "explain": "延滞を知らなかったことを伝え、延長を頼む流れに合う2が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Staff",
          "text": "Thank you for calling Sunny Table. How can I help you?"
        },
        {
          "speaker": "Caller",
          "text": "____ Do you have any tables available around seven?"
        },
        {
          "speaker": "Staff",
          "text": "Let me check... yes, we do."
        }
      ],
      "options": [
        "I already paid for my meal.",
        "Could you tell me your address?",
        "I'd like to make a reservation for four people.",
        "I'd like to cancel my reservation, please."
      ],
      "answer": 2,
      "explain": "続けて空席状況を尋ねているので、予約を取りたい1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Host mother",
          "text": "Dinner's almost ready. Could you set the table for me?"
        },
        {
          "speaker": "Student",
          "text": "____ How many plates do we need?"
        },
        {
          "speaker": "Host mother",
          "text": "Five, please — my parents are joining us tonight."
        }
      ],
      "options": [
        "No, I already ate dinner.",
        "I don't like the food you're cooking.",
        "I'm going out with my friends.",
        "Sure, I'd be happy to help."
      ],
      "answer": 3,
      "explain": "依頼を快く引き受け、必要な枚数を尋ねる流れに合う1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Student",
          "text": "Excuse me, could I ask you a question about today's homework?"
        },
        {
          "speaker": "Teacher",
          "text": "____ What part is confusing you?"
        },
        {
          "speaker": "Student",
          "text": "I don't understand the third question."
        }
      ],
      "options": [
        "Of course, go ahead.",
        "I'm afraid I'm busy right now.",
        "You should ask another student.",
        "We didn't have any homework today."
      ],
      "answer": 0,
      "explain": "質問を受け入れ、どこが分からないか尋ねる流れなので1が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Clerk",
          "text": "Would you like this gift-wrapped?"
        },
        {
          "speaker": "Customer",
          "text": "____ It's for my mother's birthday."
        },
        {
          "speaker": "Clerk",
          "text": "Sure, I'll wrap it in this pink paper, then."
        }
      ],
      "options": [
        "Yes, please, if that's possible.",
        "No, I'll eat it here.",
        "I already wrapped it myself.",
        "I'm not buying anything today."
      ],
      "answer": 0,
      "explain": "ラッピングを受け入れ、理由（母の誕生日）を続ける1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Woman",
          "text": "Excuse me, does this bus go to the city hospital?"
        },
        {
          "speaker": "Driver",
          "text": "____ You'll need to take the number 12 bus instead."
        },
        {
          "speaker": "Woman",
          "text": "Oh, I see. Thank you for telling me."
        }
      ],
      "options": [
        "Yes, it stops right in front of the hospital.",
        "No, this bus goes the other way.",
        "I don't drive this route very often.",
        "The hospital is closed on weekends."
      ],
      "answer": 1,
      "explain": "別のバスに乗るよう案内する流れに合う2が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Receptionist",
          "text": "When would you like to come in for your checkup?"
        },
        {
          "speaker": "Patient",
          "text": "____ Do you have anything in the morning?"
        },
        {
          "speaker": "Receptionist",
          "text": "Yes, we have an opening at nine on Thursday."
        }
      ],
      "options": [
        "My last appointment was in June.",
        "I already brushed my teeth today.",
        "Sometime next week would be great.",
        "I don't need a checkup this year."
      ],
      "answer": 2,
      "explain": "都合の良い時期を答え、午前の空きを尋ねる流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Club member",
          "text": "Are you interested in joining the photography club?"
        },
        {
          "speaker": "New student",
          "text": "____ Do I need my own camera?"
        },
        {
          "speaker": "Club member",
          "text": "Not at all — we have some you can borrow."
        }
      ],
      "options": [
        "No, I already have too many hobbies.",
        "I don't like taking pictures at all.",
        "I joined the tennis club last year.",
        "Yes, actually, I've always wanted to try it."
      ],
      "answer": 3,
      "explain": "興味を示し、道具について質問する流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Kenji",
          "text": "It's supposed to rain all day tomorrow."
        },
        {
          "speaker": "Aoi",
          "text": "____ Should we go bowling instead?"
        },
        {
          "speaker": "Kenji",
          "text": "That sounds like a good idea."
        }
      ],
      "options": [
        "Then our picnic plan might not work.",
        "I love rainy days like this.",
        "I already canceled the picnic last week.",
        "We should bring an umbrella to the picnic."
      ],
      "answer": 0,
      "explain": "天気を理由に代案（ボウリング）を提案する流れに合う1が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Staff",
          "text": "Can I help you?"
        },
        {
          "speaker": "Visitor",
          "text": "____ I think I left it on the train this morning."
        },
        {
          "speaker": "Staff",
          "text": "Let me check if anyone has turned one in."
        }
      ],
      "options": [
        "Yes, I'm looking for my umbrella.",
        "No, I found this bag on the platform.",
        "I'd like to buy a ticket, please.",
        "I'm just looking around, thanks."
      ],
      "answer": 0,
      "explain": "「今朝電車に置き忘れた」と続くので、探し物を伝える1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Clerk",
          "text": "The 7 o'clock show is almost sold out. Would you like the 9:30 show instead?"
        },
        {
          "speaker": "Customer",
          "text": "____ Is that showing in 3D as well?"
        },
        {
          "speaker": "Clerk",
          "text": "Yes, it is."
        }
      ],
      "options": [
        "We don't like watching movies in 3D.",
        "Sure, that time works fine for us.",
        "No, we'll come back another day.",
        "I already saw that movie twice."
      ],
      "answer": 1,
      "explain": "別の上映時間を受け入れ、3D対応かを尋ねる流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Aki",
          "text": "Could you cover my shift on Saturday? Something came up."
        },
        {
          "speaker": "Rio",
          "text": "____ I don't have any plans that day."
        },
        {
          "speaker": "Aki",
          "text": "Thank you so much, I really appreciate it."
        }
      ],
      "options": [
        "I quit my job last week.",
        "I never work on weekends.",
        "Sure, I don't mind at all.",
        "Sorry, I already have work that day."
      ],
      "answer": 2,
      "explain": "「その日は予定がない」と続くので、快諾する1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Cashier",
          "text": "Did you find everything you were looking for today?"
        },
        {
          "speaker": "Customer",
          "text": "____ Actually, do you sell gift cards here?"
        },
        {
          "speaker": "Cashier",
          "text": "Yes, we do — they're right next to the register."
        }
      ],
      "options": [
        "No, the store was closed when I arrived.",
        "I forgot my shopping list at home.",
        "I don't need a shopping bag today.",
        "Yes, thank you, I found everything."
      ],
      "answer": 3,
      "explain": "見つかったと伝えた後、追加の質問に移る自然な流れの1が正解です。"
    },
    {
      "lines": [
        {
          "speaker": "Yui",
          "text": "I was absent yesterday. Could I borrow your notes from class?"
        },
        {
          "speaker": "Sota",
          "text": "____ Just bring them back by Friday."
        },
        {
          "speaker": "Yui",
          "text": "Thank you so much, I really appreciate it."
        }
      ],
      "options": [
        "Sure, no problem at all.",
        "Sorry, I wasn't in class either.",
        "I already lent them to someone else.",
        "I don't take notes in class."
      ],
      "answer": 0,
      "explain": "「金曜までに返して」と続くので、快く貸す1が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Receptionist",
          "text": "Hello, would you like to book an appointment?"
        },
        {
          "speaker": "Customer",
          "text": "____ Do you have anything open this Saturday afternoon?"
        },
        {
          "speaker": "Receptionist",
          "text": "Let me check... yes, 2 p.m. is available."
        }
      ],
      "options": [
        "Yes, I'd like a haircut, please.",
        "No, I'm just picking up a friend.",
        "I already cut my hair myself.",
        "I don't like this hairstyle."
      ],
      "answer": 0,
      "explain": "予約を希望し、土曜の空きを尋ねる流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Driver",
          "text": "Where would you like to go?"
        },
        {
          "speaker": "Passenger",
          "text": "____ Could you take the fastest route, please?"
        },
        {
          "speaker": "Driver",
          "text": "Sure, I know a good way to avoid traffic."
        }
      ],
      "options": [
        "I'm not sure how to drive there.",
        "To the central station, please.",
        "I don't have any cash with me.",
        "I'll walk from here, thank you."
      ],
      "answer": 1,
      "explain": "行き先を伝え、続けてルートをお願いする流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Student",
          "text": "What should I bring for the school trip to the mountains?"
        },
        {
          "speaker": "Teacher",
          "text": "____ Also, don't forget your rain jacket."
        },
        {
          "speaker": "Student",
          "text": "OK, I'll pack those tonight."
        }
      ],
      "options": [
        "The trip has already been canceled.",
        "We're not allowed to bring bags this year.",
        "You'll need warm clothes and good walking shoes.",
        "You don't need to bring anything at all."
      ],
      "answer": 2,
      "explain": "「レインジャケットも忘れずに」と続くので、具体的な持ち物を答える1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Customer",
          "text": "My laptop won't turn on at all. Can someone take a look?"
        },
        {
          "speaker": "Staff",
          "text": "____ Please leave it with us, and we'll check the battery and the screen."
        },
        {
          "speaker": "Customer",
          "text": "Thank you, I really appreciate it."
        }
      ],
      "options": [
        "Sorry, we don't repair computers here.",
        "You should buy a brand new one instead.",
        "I don't know anything about computers.",
        "Of course, let me have a technician check it."
      ],
      "answer": 3,
      "explain": "技術者による確認へつながる自然な返答の1が正解です。"
    },
    {
      "lines": [
        {
          "speaker": "Coordinator",
          "text": "We still need a few more people for the beach cleanup this weekend."
        },
        {
          "speaker": "Student",
          "text": "____ What time should I arrive?"
        },
        {
          "speaker": "Coordinator",
          "text": "Please come by nine in the morning."
        }
      ],
      "options": [
        "I'd love to help out.",
        "I already cleaned my room today.",
        "I don't like going to the beach.",
        "I volunteered last month already."
      ],
      "answer": 0,
      "explain": "参加を申し出て、集合時間を尋ねる流れなので1が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Emi",
          "text": "I'm having a small birthday party next Friday. Can you come?"
        },
        {
          "speaker": "Ren",
          "text": "____ What time should I come?"
        },
        {
          "speaker": "Emi",
          "text": "Around six would be perfect."
        }
      ],
      "options": [
        "I'd love to, thanks for inviting me.",
        "Sorry, I don't celebrate birthdays.",
        "I already had a party last week.",
        "I'm not sure whose birthday it is."
      ],
      "answer": 0,
      "explain": "誘いを受け入れ、時間を尋ねる流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Taro",
          "text": "Are you going to watch the baseball game this weekend?"
        },
        {
          "speaker": "Nana",
          "text": "____ What time does it start?"
        },
        {
          "speaker": "Taro",
          "text": "It starts at one, so let's meet at noon."
        }
      ],
      "options": [
        "I don't have any free time this year.",
        "Yes, I really want to cheer for our school team.",
        "No, I don't know how baseball works.",
        "I already watched that game on TV."
      ],
      "answer": 1,
      "explain": "応援したい気持ちを伝え、開始時間を尋ねる流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Student",
          "text": "I'm looking for books about Japanese history for my report."
        },
        {
          "speaker": "Librarian",
          "text": "____ They're all in the section on the second floor."
        },
        {
          "speaker": "Student",
          "text": "Great, thank you for your help."
        }
      ],
      "options": [
        "You should ask at the front desk instead.",
        "The library is closing in five minutes.",
        "We have quite a few on that topic.",
        "I'm sorry, we don't have any history books."
      ],
      "answer": 2,
      "explain": "2階の該当コーナーに案内する流れに合う1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Customer",
          "text": "Do you have anything for a bad headache?"
        },
        {
          "speaker": "Pharmacist",
          "text": "____ How long have you had the headache?"
        },
        {
          "speaker": "Customer",
          "text": "Since this morning."
        }
      ],
      "options": [
        "No, we don't sell any medicine here.",
        "I have a headache myself today.",
        "You should see a dentist instead.",
        "Sure, this medicine usually works well."
      ],
      "answer": 3,
      "explain": "薬を勧め、症状の期間を尋ねる自然な流れの1が正解です。"
    },
    {
      "lines": [
        {
          "speaker": "Hana",
          "text": "Do you want to go hiking with us this Sunday?"
        },
        {
          "speaker": "Leo",
          "text": "____ What time are we planning to leave?"
        },
        {
          "speaker": "Hana",
          "text": "We're thinking of leaving at seven in the morning."
        }
      ],
      "options": [
        "Sure, that sounds like fun.",
        "No, I don't like walking outside.",
        "I already went hiking yesterday.",
        "I'm allergic to mountain air."
      ],
      "answer": 0,
      "explain": "誘いを受け入れ、出発時間を尋ねる流れなので1が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Applicant",
          "text": "Hello, I'm calling about the part-time job I applied for."
        },
        {
          "speaker": "Manager",
          "text": "____ Are you available this Thursday at four?"
        },
        {
          "speaker": "Applicant",
          "text": "Yes, that works perfectly for me."
        }
      ],
      "options": [
        "We'd like to schedule an interview with you.",
        "I'm afraid the position has already been filled.",
        "We don't have any part-time jobs available.",
        "Could you send us your resume by email?"
      ],
      "answer": 0,
      "explain": "続けて面接日時を提案しているので、面接設定を伝える1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Customer",
          "text": "This blender stopped working after only two days."
        },
        {
          "speaker": "Clerk",
          "text": "____ Do you have the receipt with you?"
        },
        {
          "speaker": "Customer",
          "text": "Yes, right here."
        }
      ],
      "options": [
        "We can't do anything without a warranty card.",
        "I'm so sorry to hear that. Let's exchange it for a new one.",
        "That's strange, it should last for years.",
        "You probably used it the wrong way."
      ],
      "answer": 1,
      "explain": "お詫びと交換対応を伝え、レシートの有無を尋ねる自然な流れの1が正解です。"
    },
    {
      "lines": [
        {
          "speaker": "Student",
          "text": "Could you write a recommendation letter for my university application?"
        },
        {
          "speaker": "Teacher",
          "text": "____ When do you need it by?"
        },
        {
          "speaker": "Student",
          "text": "By the end of next month, if possible."
        }
      ],
      "options": [
        "You should ask a different teacher instead.",
        "I've never written one of those before.",
        "Of course, I'd be happy to write one for you.",
        "I don't think you're ready for university."
      ],
      "answer": 2,
      "explain": "依頼を快諾し、締め切りを尋ねる流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Riku",
          "text": "Do you want to study for the English test together this weekend?"
        },
        {
          "speaker": "Sana",
          "text": "____ Where should we meet?"
        },
        {
          "speaker": "Riku",
          "text": "How about the library near the station?"
        }
      ],
      "options": [
        "No, I already finished studying for it.",
        "I don't have an English test this week.",
        "I'd rather study alone this time.",
        "Sure, that sounds like a great idea."
      ],
      "answer": 3,
      "explain": "提案を受け入れ、場所を尋ねる流れに合う1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Exchange student",
          "text": "What time should I be home in the evening?"
        },
        {
          "speaker": "Host father",
          "text": "____ Just send us a message if you'll be later than that."
        },
        {
          "speaker": "Student",
          "text": "OK, I'll remember that."
        }
      ],
      "options": [
        "We usually ask everyone to be home by ten.",
        "You can stay out as late as you like.",
        "We don't really have any rules about that.",
        "You should ask my wife instead of me."
      ],
      "answer": 0,
      "explain": "具体的な門限を伝え、遅れる場合の対応を続ける流れなので1が自然です。"
    }
  ],
  [
    {
      "lines": [
        {
          "speaker": "Caller",
          "text": "Hi, I'd like to cancel my reservation for tonight, if possible."
        },
        {
          "speaker": "Staff",
          "text": "____ May I ask the name on the reservation?"
        },
        {
          "speaker": "Caller",
          "text": "It's under Tanaka."
        }
      ],
      "options": [
        "Of course, I can help you with that.",
        "I'm afraid we're completely full tonight.",
        "Your reservation was already canceled.",
        "We don't accept cancellations by phone."
      ],
      "answer": 0,
      "explain": "キャンセル対応を承諾し、名前を確認する流れなので1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "New student",
          "text": "Is it too late to join the art club this semester?"
        },
        {
          "speaker": "Club leader",
          "text": "____ We'd love to have more members."
        },
        {
          "speaker": "Student",
          "text": "That's great to hear."
        }
      ],
      "options": [
        "You need special permission from the principal.",
        "Not at all, you're welcome to join anytime.",
        "Yes, the club stopped accepting new members in April.",
        "I'm sorry, our club was canceled this year."
      ],
      "answer": 1,
      "explain": "「もっとメンバーが欲しい」と続くので、参加を歓迎する1が自然です。"
    },
    {
      "lines": [
        {
          "speaker": "Customer",
          "text": "Hi, I'd like to order a large pizza for delivery."
        },
        {
          "speaker": "Staff",
          "text": "____ What toppings would you like?"
        },
        {
          "speaker": "Customer",
          "text": "Just cheese and mushrooms, please."
        }
      ],
      "options": [
        "We're closed for the day already.",
        "You'll need to pick it up yourself.",
        "Sure, could I get your address first?",
        "Sorry, we don't deliver in your area."
      ],
      "answer": 2,
      "explain": "注文を受け付け、トッピングを尋ねる自然な流れの1が正解です。"
    },
    {
      "lines": [
        {
          "speaker": "Traveler",
          "text": "Excuse me, could you help me carry this suitcase up the stairs?"
        },
        {
          "speaker": "Stranger",
          "text": "____ It looks pretty heavy."
        },
        {
          "speaker": "Traveler",
          "text": "Thank you so much, I really appreciate it."
        }
      ],
      "options": [
        "Sorry, I'm in a hurry right now.",
        "There's an elevator around the corner.",
        "I don't think it will fit in the elevator.",
        "Sure, let me give you a hand."
      ],
      "answer": 3,
      "explain": "手伝いを申し出て理由を続ける自然な流れの1が正解です。"
    },
    {
      "lines": [
        {
          "speaker": "Mother",
          "text": "Could you clean your room and take out the trash before dinner?"
        },
        {
          "speaker": "Son",
          "text": "____ I'll do it right after I finish my homework."
        },
        {
          "speaker": "Mother",
          "text": "That sounds good, thank you."
        }
      ],
      "options": [
        "Sure, I can do that.",
        "I already cleaned it yesterday.",
        "I don't have any homework today.",
        "Can we have dinner later instead?"
      ],
      "answer": 0,
      "explain": "「宿題が終わったらすぐやる」と続くので、依頼を引き受ける1が自然です。"
    }
  ]
];

export const EIKEN_SECTION3_PATTERNS: EikenReadingPattern[] = [
  {
    "partA": {
      "title": "Green Hill Library — Summer Reading Challenge",
      "passage": [
        "Dates: July 20 – August 31 &nbsp;|&nbsp; For: Elementary and junior high school students",
        "<b>How to join:</b> Read 5 or more books during the summer and write a short report about one of them. Bring the report to the front desk.",
        "<b>Prize:</b> Students who finish the challenge will get a special bookmark, and their name will be posted on the \"Summer Readers\" board in the library.",
        "<b>Note:</b> Book reports must be handed in by September 3. Reports written in pencil are welcome, but please write your name and grade clearly at the top."
      ],
      "items": [
        {
          "text": "What do students need to do to join the Summer Reading Challenge?",
          "options": [
            "Read five or more books and write a report about one of them.",
            "Borrow a special bookmark from the front desk.",
            "Write their name on the \"Summer Readers\" board.",
            "Visit the library every day during summer vacation."
          ],
          "answer": 0,
          "explain": "本文2文目「Read 5 or more books ... and write a short report」から2が正解です。"
        },
        {
          "text": "What will happen to students who complete the challenge?",
          "options": [
            "They will be asked to help at the front desk.",
            "They will receive a bookmark and have their name posted in the library.",
            "They will be given five new books for free.",
            "They will not have to return their books until September."
          ],
          "answer": 1,
          "explain": "「get a special bookmark and their name will be posted」とあるため1が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: About next weekend",
      "passage": [
        "<span class=\"label\">From</span> Emily &nbsp; <span class=\"label\">To</span> Sara &nbsp; <span class=\"label\">Subject</span> About next weekend",
        "Hi Sara,",
        "Thank you for inviting me to your house next Saturday. I'm really looking forward to it! However, I have some news. My host family told me yesterday that we are going to visit my host mother's parents in Nagano that day, so I won't be able to come until Sunday afternoon.",
        "I'm so sorry about the sudden change. Would it be possible to meet on Sunday instead? If Sunday doesn't work for you, maybe we could plan for the following weekend. Also, could you tell me what time your family usually has dinner? I want to bring something for everyone, and I'd like to arrive at a good time.",
        "Please let me know what you think.",
        "Best, Emily"
      ],
      "items": [
        {
          "text": "Why can't Emily visit Sara on Saturday?",
          "options": [
            "Her host family is coming to visit her.",
            "She has to study for a test.",
            "She is going to Nagano with her host family.",
            "She is not feeling well."
          ],
          "answer": 2,
          "explain": "「we are going to visit my host mother's parents in Nagano」から2が正解です。"
        },
        {
          "text": "What does Emily ask Sara to do?",
          "options": [
            "Bring something for her host family.",
            "Cancel the visit completely.",
            "Come to Nagano with her.",
            "Tell her the family's usual dinner time."
          ],
          "answer": 3,
          "explain": "「could you tell me what time your family usually has dinner?」から3が正解です。"
        },
        {
          "text": "What will Emily probably do next?",
          "options": [
            "Wait for Sara's reply about a new day to meet.",
            "Ask her host mother to change the trip.",
            "Stop planning to visit Sara at all.",
            "Visit Sara on Saturday as originally planned."
          ],
          "answer": 0,
          "explain": "Emilyは日曜への変更を提案しており、返事を待つ流れなので2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "A Small Idea That Grew",
      "passage": [
        "Yuji is a second-year student at a high school in Chiba. Last spring, he noticed that many students in his class threw plastic bottles into the regular trash can instead of putting them in the recycling bin. At first, he didn't think much about it, but after his science teacher showed the class a documentary about ocean plastic pollution, Yuji started to feel that something had to change.",
        "The next week, Yuji asked his teacher if he could put a special recycling box next to the classroom door. His teacher agreed, but told him that it would only work if his classmates actually used it. So Yuji made a simple poster explaining why recycling mattered and put it above the box. For the first few days, almost no one used it. Yuji felt disappointed, but he decided not to give up. Instead, he asked two of his close friends to help him remind classmates every morning.",
        "Slowly, more and more students began to use the recycling box. By the end of the month, the amount of trash in the regular bin had dropped by half. When the school's vice principal heard about Yuji's idea from his teacher, she asked him to introduce the same system in every classroom. Yuji was surprised but happy to help.",
        "Now, recycling boxes can be found in every classroom in the school, and Yuji is planning to start a similar project at the community center near his house. He says, \"I learned that even a small idea can make a big difference if you don't give up after the first try.\""
      ],
      "items": [
        {
          "text": "Why did Yuji start thinking about recycling?",
          "options": [
            "His teacher asked him to write a report about it.",
            "He watched a documentary about ocean plastic pollution in class.",
            "He read a poster about recycling at school.",
            "His classmates asked him to make a recycling box."
          ],
          "answer": 1,
          "explain": "「after his science teacher showed the class a documentary about ocean plastic pollution」から2が正解です。"
        },
        {
          "text": "What happened right after Yuji put the recycling box in his classroom?",
          "options": [
            "Almost every student started using it immediately.",
            "The teacher removed the box because it wasn't needed.",
            "Hardly any students used it at first.",
            "The vice principal asked him to remove the poster."
          ],
          "answer": 2,
          "explain": "「For the first few days, almost no one used it」から3が正解です。"
        },
        {
          "text": "How did Yuji get more classmates to use the recycling box?",
          "options": [
            "He gave a prize to students who used it.",
            "He asked the teacher to make it a class rule.",
            "He wrote each student's name on the box.",
            "He asked friends to help remind classmates every morning."
          ],
          "answer": 3,
          "explain": "「he asked two of his close friends to help him remind classmates every morning」から1が正解です。"
        },
        {
          "text": "What did the vice principal ask Yuji to do?",
          "options": [
            "Introduce the recycling system in every classroom.",
            "Give a speech about ocean pollution at an assembly.",
            "Write a letter to city hall about the project.",
            "Stop the recycling project because of a school rule."
          ],
          "answer": 0,
          "explain": "「she asked him to introduce the same system in every classroom」から2が正解です。"
        },
        {
          "text": "What does Yuji plan to do next?",
          "options": [
            "Ask the science teacher to give another lecture.",
            "Start a similar recycling project at a community center.",
            "Make a new poster for the school's front gate.",
            "Study marine biology in college."
          ],
          "answer": 1,
          "explain": "「planning to start a similar project at the community center」から3が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Riverside Junior High School — Summer Pool Hours",
      "passage": [
        "The school swimming pool will be open for student use every weekday from July 22 to August 5, from 9:00 a.m. to 11:30 a.m.",
        "Students in grades 7 to 9 may use the pool free of charge, but each student must bring a signed permission form from a parent or guardian on the first visit. Swim caps are required, and students should bring their own towel.",
        "The pool will be closed on rainy days and during the school's open campus event on July 30. For more information, please contact the P.E. office."
      ],
      "items": [
        {
          "text": "When is the school pool open for students this summer?",
          "options": [
            "Weekdays from July 22 to August 5, in the morning",
            "Weekends only, in the afternoon",
            "Only during the open campus event",
            "Every day from July 22 to August 5"
          ],
          "answer": 0,
          "explain": "1文目「every weekday ... from 9:00 a.m. to 11:30 a.m.」から2が正解です。"
        },
        {
          "text": "What must students bring on their first visit to the pool?",
          "options": [
            "A towel and a swim cap only",
            "A signed permission form from a parent or guardian",
            "Money to pay the entrance fee",
            "A letter from the P.E. teacher"
          ],
          "answer": 1,
          "explain": "「must bring a signed permission form from a parent or guardian on the first visit」から2が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Practice Change This Week",
      "passage": [
        "<span class=\"label\">From</span> Coach Ito &nbsp; <span class=\"label\">To</span> Team &nbsp; <span class=\"label\">Subject</span> Practice Change This Week",
        "Hi everyone,",
        "I'm writing to let you know that tomorrow's basketball practice has been canceled because the gym floor is being repaired. Instead, we will meet in the classroom at the usual time to watch some videos of professional games and talk about strategy.",
        "Please bring a notebook so you can take notes. Also, don't forget that Friday's practice will start thirty minutes earlier than usual, at 3:30, since we need extra time to prepare for next week's tournament. If you can't make it on Friday, please text me before Thursday evening.",
        "See you tomorrow in the classroom.",
        "Coach Ito"
      ],
      "items": [
        {
          "text": "Why was tomorrow's basketball practice canceled?",
          "options": [
            "The tournament was canceled.",
            "The team lost their last game.",
            "The gym floor is being repaired.",
            "Coach Ito is sick."
          ],
          "answer": 2,
          "explain": "「the gym floor is being repaired」から2が正解です。"
        },
        {
          "text": "What are students asked to bring tomorrow?",
          "options": [
            "Their uniform",
            "A video camera",
            "A basketball",
            "A notebook"
          ],
          "answer": 3,
          "explain": "「Please bring a notebook」から2が正解です。"
        },
        {
          "text": "What is different about Friday's practice?",
          "options": [
            "It will start thirty minutes earlier than usual.",
            "It has been completely canceled.",
            "It will be led by a different coach.",
            "It will be held in a different gym."
          ],
          "answer": 0,
          "explain": "「Friday's practice will start thirty minutes earlier than usual, at 3:30」から2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "A Melody at Lunchtime",
      "passage": [
        "Sora had always loved music, but her school didn't have a music club — only a brass band for concerts, which required students to practice almost every day after school. Sora wanted to play guitar with friends in a more relaxed way, without such a heavy schedule.",
        "One day in October, Sora asked her homeroom teacher if it would be possible to start a small group that met during lunchtime instead of after school. Her teacher liked the idea but told her she would need at least five members and a teacher willing to supervise the group once a week.",
        "At first, Sora worried that no one would be interested, since most students spent lunchtime with their close friends. She made a simple flyer and put it on the classroom bulletin board, asking anyone who liked music to meet her in the music room on Wednesday. To her surprise, seven students showed up on the first day, including two students from a different class she had never talked to before.",
        "The group decided to call themselves the \"Lunchtime Melody Club.\" They took turns choosing songs to practice together, and students who couldn't play an instrument were welcome to simply sing along. After a few months, the club performed three short songs at the school's winter assembly, and the audience clapped enthusiastically.",
        "Sora later said, \"I was nervous that nobody would come, but now I've made new friends I never would have met otherwise. It shows that even a small idea, if you take the first step, can bring people together.\""
      ],
      "items": [
        {
          "text": "Why did Sora want to start a new club?",
          "options": [
            "She didn't like the students in the brass band.",
            "She thought the brass band's schedule was too demanding for what she wanted.",
            "She was told to join a club by her teacher.",
            "She wanted to become a professional guitarist."
          ],
          "answer": 1,
          "explain": "「without such a heavy schedule」というブラスバンドとの対比から1が正解です。"
        },
        {
          "text": "What did the teacher say Sora needed to start the club?",
          "options": [
            "A budget for musical instruments.",
            "A written plan approved by the principal.",
            "At least five members and a supervising teacher.",
            "Permission from every student's parents."
          ],
          "answer": 2,
          "explain": "「she would need at least five members and a teacher willing to supervise」から2が正解です。"
        },
        {
          "text": "What happened when Sora put up her flyer?",
          "options": [
            "The teacher canceled the meeting.",
            "No one came to the music room at all.",
            "Only her close friends joined the group.",
            "Seven students showed up, including some she didn't know."
          ],
          "answer": 3,
          "explain": "「seven students showed up ... including two students ... she had never talked to before」から3が正解です。"
        },
        {
          "text": "What did the Lunchtime Melody Club do at the winter assembly?",
          "options": [
            "They performed three short songs.",
            "They sold homemade instruments.",
            "They watched a professional band perform.",
            "They gave a speech about music education."
          ],
          "answer": 0,
          "explain": "「the club performed three short songs at the school's winter assembly」から2が正解です。"
        },
        {
          "text": "What did Sora learn from starting the club?",
          "options": [
            "That most students are not interested in music.",
            "That taking the first step can bring people together.",
            "That lunchtime clubs are not allowed at her school.",
            "That she should have joined the brass band instead."
          ],
          "answer": 1,
          "explain": "最終文「even a small idea ... can bring people together」から3が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Maple Town Autumn Festival",
      "passage": [
        "Date: Saturday, October 18, 10:00 a.m. – 6:00 p.m. &nbsp;|&nbsp; Place: Maple Town Central Park.",
        "This year's festival will feature food stalls from local restaurants, a used-book market run by the town library, and a stage performance by students from three nearby schools. Admission is free for everyone.",
        "Volunteers are needed to help set up tables in the morning and clean up after the festival ends. Volunteers will receive a free festival T-shirt and a meal ticket. If you would like to volunteer, please sign up at the town hall information desk by October 10."
      ],
      "items": [
        {
          "text": "What can visitors do at the festival this year?",
          "options": [
            "Buy used books and watch student performances.",
            "Enter a cooking competition.",
            "Take a class on how to volunteer.",
            "Meet the mayor of Maple Town."
          ],
          "answer": 0,
          "explain": "「a used-book market ... and a stage performance by students」から1が正解です。"
        },
        {
          "text": "What will volunteers receive?",
          "options": [
            "A cash payment for their work.",
            "A free T-shirt and a meal ticket.",
            "Free tickets to next year's festival.",
            "A certificate from the mayor."
          ],
          "answer": 1,
          "explain": "「Volunteers will receive a free festival T-shirt and a meal ticket」から2が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Question about school tomorrow",
      "passage": [
        "<span class=\"label\">From</span> Chloe &nbsp; <span class=\"label\">To</span> Ms. Tanaka &nbsp; <span class=\"label\">Subject</span> Question about school tomorrow",
        "Dear Ms. Tanaka,",
        "Thank you again for helping me get ready for my first day at Sakura High School tomorrow. I just have a couple of questions before I go to bed.",
        "First, I noticed the uniform you bought me doesn't have a jacket. Should I wear a sweater underneath if it's cold, or does the school not allow that? Also, I remember you mentioned that indoor shoes are different from outdoor shoes — could you show me which pair to bring tomorrow morning, since I'm not sure which bag they're in?",
        "Thank you for being so patient with me. I'm a little nervous, but also very excited to meet my new classmates.",
        "Best, Chloe"
      ],
      "items": [
        {
          "text": "What is Chloe's first question about?",
          "options": [
            "What time school starts tomorrow.",
            "Whether her host mother will come with her.",
            "Whether she can wear a sweater under her uniform.",
            "Whether she needs to buy her own uniform."
          ],
          "answer": 2,
          "explain": "「Should I wear a sweater underneath if it's cold」から1が正解です。"
        },
        {
          "text": "What does Chloe need help finding?",
          "options": [
            "Her school bag.",
            "Her uniform jacket.",
            "Her bus pass.",
            "Her indoor shoes."
          ],
          "answer": 3,
          "explain": "「could you show me which pair to bring ... since I'm not sure which bag they're in」の pair は上履きを指すため1が正解です。"
        },
        {
          "text": "How does Chloe feel about her first day of school?",
          "options": [
            "Nervous but also excited.",
            "Angry about the uniform rules.",
            "Uninterested in meeting new people.",
            "Completely confident and calm."
          ],
          "answer": 0,
          "explain": "「I'm a little nervous, but also very excited」から2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "Finding Her Voice",
      "passage": [
        "Nao had always been the quietest student in her class. Whenever a teacher asked her to answer a question in front of everyone, her hands would shake, and she would speak so softly that classmates often couldn't hear her. So when her English teacher suggested that she enter the school's English speech contest, Nao immediately said no.",
        "However, her teacher didn't give up easily. She told Nao, \"You don't have to be the best speaker. You just have to say something you truly believe in.\" After thinking about it for a few days, Nao finally agreed to try, on the condition that her teacher would help her practice.",
        "For the next month, Nao practiced her speech about her grandmother's garden almost every day after school, first alone in an empty classroom, then in front of her teacher, and later in front of a few close friends. Each time, she felt a little less nervous than before. Her teacher also taught her a simple trick: to look just above the audience's heads instead of directly at their faces.",
        "On the day of the contest, Nao's heart was pounding as she walked up to the microphone. But once she began speaking about her grandmother's tomatoes and flowers, she found herself forgetting to be afraid. She didn't win first place, but she received a special award for \"Most Improved Speaker,\" and the whole audience applauded warmly.",
        "After the contest, Nao told her teacher, \"I still don't love speaking in public, but now I know I can do it when it matters.\" She even began raising her hand more often in class after that day."
      ],
      "items": [
        {
          "text": "Why did Nao say no when her teacher first suggested the speech contest?",
          "options": [
            "She didn't have a topic to speak about.",
            "She was afraid of speaking in front of others.",
            "She didn't like her English teacher.",
            "She was too busy with other clubs."
          ],
          "answer": 1,
          "explain": "冒頭の描写「her hands would shake ... speak so softly」から2が正解です。"
        },
        {
          "text": "What condition did Nao set before agreeing to enter the contest?",
          "options": [
            "That she wouldn't have to speak in front of an audience.",
            "That she could choose any topic she wanted.",
            "That her teacher would help her practice.",
            "That she could enter with a friend."
          ],
          "answer": 2,
          "explain": "「on the condition that her teacher would help her practice」から2が正解です。"
        },
        {
          "text": "What trick did the teacher teach Nao?",
          "options": [
            "To imagine the audience wasn't there at all.",
            "To memorize her speech word for word.",
            "To speak as fast as possible.",
            "To look just above the audience's heads."
          ],
          "answer": 3,
          "explain": "「to look just above the audience's heads instead of directly at their faces」から3が正解です。"
        },
        {
          "text": "What happened at the speech contest?",
          "options": [
            "Nao received a special award for improvement.",
            "Nao refused to go on stage.",
            "Nao forgot her speech completely.",
            "Nao won first place in the contest."
          ],
          "answer": 0,
          "explain": "「she received a special award for 'Most Improved Speaker'」から3が正解です。"
        },
        {
          "text": "How did Nao change after the contest?",
          "options": [
            "She decided never to speak in public again.",
            "She began raising her hand more often in class.",
            "She quit the English class entirely.",
            "She became the top student in her school."
          ],
          "answer": 1,
          "explain": "最終文「She even began raising her hand more often in class」から2が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Greenfield Community Center — Autumn Cooking Class",
      "passage": [
        "Every Tuesday evening from October 3 to October 24, 6:30–8:00 p.m., in the community center kitchen.",
        "This four-week class will teach basic Japanese home cooking, including rice dishes, miso soup, and simple desserts. The class is open to anyone aged 15 and older, and no cooking experience is needed.",
        "The fee is 2,000 yen for all four classes, which covers the cost of ingredients. Please bring your own apron. Space is limited to 12 people, so please register at the front desk by September 26."
      ],
      "items": [
        {
          "text": "Who can join the cooking class?",
          "options": [
            "Anyone aged 15 or older, with no experience needed.",
            "Only members of the community center.",
            "Only students from local high schools.",
            "Only people who already know how to cook."
          ],
          "answer": 0,
          "explain": "「open to anyone aged 15 and older, and no cooking experience is needed」から2が正解です。"
        },
        {
          "text": "What does the 2,000 yen fee cover?",
          "options": [
            "A membership fee for the community center.",
            "The cost of ingredients for all four classes.",
            "A one-time registration fee only.",
            "The cost of an apron for each student."
          ],
          "answer": 1,
          "explain": "「which covers the cost of ingredients」から1が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Change of plan for Saturday",
      "passage": [
        "<span class=\"label\">From</span> Jun &nbsp; <span class=\"label\">To</span> Aya &nbsp; <span class=\"label\">Subject</span> Change of plan for Saturday",
        "Hi Aya,",
        "I hope you're doing well! I wanted to update you about Saturday's plan for Mika's surprise birthday party. We originally planned to meet at my house at 5:00, but my mom just told me that the living room floor is being cleaned that afternoon, so we can't use my house until 6:00.",
        "Would it be OK to move the meeting time to 6:00 instead? I know that's later than we planned, but we should still have plenty of time before Mika arrives at 7:30. If 6:00 doesn't work for you, we could also meet at the community center instead, since they have a small room we could borrow.",
        "Please let me know which option is better for you by tonight, so I can tell the others.",
        "Thanks, Jun"
      ],
      "items": [
        {
          "text": "Why can't they meet at Jun's house at 5:00 as planned?",
          "options": [
            "Jun's house is too small for everyone.",
            "Jun's mother doesn't want guests over.",
            "The living room floor is being cleaned that afternoon.",
            "Mika found out about the surprise party."
          ],
          "answer": 2,
          "explain": "「the living room floor is being cleaned that afternoon」から2が正解です。"
        },
        {
          "text": "What alternative does Jun suggest if 6:00 doesn't work for Aya?",
          "options": [
            "Asking Mika to come earlier.",
            "Moving the party to a different day.",
            "Canceling the party completely.",
            "Having the party at the community center instead."
          ],
          "answer": 3,
          "explain": "「we could also meet at the community center instead」から2が正解です。"
        },
        {
          "text": "What does Jun ask Aya to do?",
          "options": [
            "Tell him which meeting option is better by tonight.",
            "Pick up Mika from her house at 7:30.",
            "Clean the living room floor herself.",
            "Buy a birthday present for Mika."
          ],
          "answer": 0,
          "explain": "「Please let me know which option is better for you by tonight」から2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "Grandpa's Shop Goes Online",
      "passage": [
        "Rin's grandfather has run a small tofu shop in the same neighborhood for over forty years. When Rin was in middle school, she noticed that fewer customers were visiting the shop each month, even though her grandfather's tofu was, in her opinion, the best in town. Most of his old customers were getting older, and younger families in the area didn't seem to know the shop existed.",
        "During summer vacation in her first year of high school, Rin decided to help. She asked her grandfather if she could take photos of the shop and post them online, since she had learned some basic web design in her computer class at school. Her grandfather was hesitant at first — he had never used social media and worried it wouldn't suit an old-fashioned shop like his. Still, he agreed to let her try, as long as it didn't interrupt his work.",
        "Rin created a simple page showing photos of the tofu-making process, along with short videos of her grandfather explaining traditional techniques passed down from his own grandfather. She also added the shop's address and opening hours, which had never been posted anywhere online before.",
        "Within a few weeks, several young families who had recently moved into the neighborhood visited the shop after seeing Rin's posts, and some even told her grandfather they didn't know such a wonderful shop existed nearby. Sales slowly began to increase.",
        "Rin's grandfather, once uncertain about the whole idea, now proudly shows customers the online page whenever they visit. He told Rin, \"I never imagined technology could bring more people to my little shop. Thank you for believing in it as much as I do.\""
      ],
      "items": [
        {
          "text": "What problem did Rin notice about her grandfather's shop?",
          "options": [
            "The shop was too expensive for most customers.",
            "Fewer customers were visiting each month.",
            "Her grandfather wanted to close the shop.",
            "The tofu recipe had changed and customers disliked it."
          ],
          "answer": 1,
          "explain": "「fewer customers were visiting the shop each month」から2が正解です。"
        },
        {
          "text": "Why hadn't younger families been visiting the shop?",
          "options": [
            "They didn't like tofu.",
            "The shop was too far from their houses.",
            "They didn't seem to know the shop existed.",
            "The shop was only open at night."
          ],
          "answer": 2,
          "explain": "「younger families ... didn't seem to know the shop existed」から3が正解です。"
        },
        {
          "text": "How did Rin's grandfather feel about the idea at first?",
          "options": [
            "Angry that Rin wanted to change his shop.",
            "Completely uninterested in the idea.",
            "Extremely excited and supportive.",
            "Hesitant, since he had never used social media."
          ],
          "answer": 3,
          "explain": "「Her grandfather was hesitant at first ... he had never used social media」から2が正解です。"
        },
        {
          "text": "What did Rin include on the page she created?",
          "options": [
            "Photos, videos, and the shop's address and hours.",
            "A message asking for donations.",
            "An online form to order tofu by mail.",
            "Only a list of prices for each product."
          ],
          "answer": 0,
          "explain": "「photos ... short videos ... the shop's address and opening hours」から2が正解です。"
        },
        {
          "text": "What did Rin's grandfather say to her at the end?",
          "options": [
            "He asked her to stop updating the page.",
            "He thanked her for believing in the idea.",
            "He said the page didn't help at all.",
            "He decided to close the shop anyway."
          ],
          "answer": 1,
          "explain": "最終文「Thank you for believing in it as much as I do」から2が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Central City Library — Extended Hours During Exam Week",
      "passage": [
        "From November 11 to November 15, the second-floor study room will stay open until 9:00 p.m. on weekdays, one hour later than usual, to support students preparing for exams.",
        "Seats can be reserved online up to one day in advance, or students may check availability at the front desk. Food is not allowed in the study room, but drinks with a lid are permitted.",
        "Please note that the study room will return to its regular closing time of 8:00 p.m. starting November 16."
      ],
      "items": [
        {
          "text": "Why is the library extending its hours in November?",
          "options": [
            "To support students preparing for exams.",
            "Because the library will be closed the following week.",
            "Because more books have arrived recently.",
            "To celebrate the library's anniversary."
          ],
          "answer": 0,
          "explain": "「to support students preparing for exams」から2が正解です。"
        },
        {
          "text": "What is NOT allowed in the study room?",
          "options": [
            "Reserving a seat in advance.",
            "Food.",
            "Studying after 8:00 p.m. during exam week.",
            "Drinks with a lid."
          ],
          "answer": 1,
          "explain": "「Food is not allowed in the study room」から3が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Could you help me this weekend?",
      "passage": [
        "<span class=\"label\">From</span> Leo &nbsp; <span class=\"label\">To</span> Ben &nbsp; <span class=\"label\">Subject</span> Could you help me this weekend?",
        "Hey Ben,",
        "I hope you're free this Saturday! As you know, my family is moving to a new apartment next month, and my parents asked me to start packing my room this weekend. There's honestly a lot more stuff than I expected, especially books and old school notebooks.",
        "Would you be able to come over around 1:00 to help me sort things into boxes? I promise it won't take more than three hours, and my mom said she'd order pizza for us afterward. If Saturday doesn't work, maybe Sunday morning could work instead — just let me know which is better for you.",
        "Also, if you have any spare cardboard boxes at home, could you bring a few? We're running low.",
        "Thanks so much, Leo"
      ],
      "items": [
        {
          "text": "Why does Leo need help this weekend?",
          "options": [
            "He is cleaning the house for guests.",
            "He is preparing for a school exam.",
            "He needs to pack his room before moving.",
            "He is organizing a birthday party."
          ],
          "answer": 2,
          "explain": "「my parents asked me to start packing my room this weekend」から2が正解です。"
        },
        {
          "text": "What does Leo offer Ben after the work is done?",
          "options": [
            "A gift from the new apartment.",
            "Money for his help.",
            "A ride home.",
            "Pizza."
          ],
          "answer": 3,
          "explain": "「my mom said she'd order pizza for us afterward」から3が正解です。"
        },
        {
          "text": "What does Leo ask Ben to bring?",
          "options": [
            "Some cardboard boxes.",
            "His own lunch.",
            "Extra pizza.",
            "Packing tape."
          ],
          "answer": 0,
          "explain": "「if you have any spare cardboard boxes at home, could you bring a few?」から1が正解です。"
        }
      ]
    },
    "partC": {
      "title": "Finding His Footing",
      "passage": [
        "When Daiki joined his high school's soccer team in April, he was one of the few first-year students who had never played soccer competitively before. During his first few practices, he could barely keep up with the running drills, and his passes often went to the wrong player. Some of his teammates, who had played since elementary school, seemed to move almost effortlessly compared to him.",
        "After a particularly difficult practice in May, Daiki considered quitting. However, his coach, Mr. Yamada, called him over and said, \"Everyone starts somewhere. What matters is what you do after you fail, not the fact that you failed.\" He suggested that Daiki practice basic ball control alone for twenty minutes every morning before school, in addition to regular team practice.",
        "Daiki decided to try it. Every morning, rain or shine, he practiced simple dribbling and passing drills in the small park near his house. It felt slow and repetitive at first, and he sometimes wondered if it was making any difference at all.",
        "By the end of the summer, though, his teammates began to notice a change. His passes had become more accurate, and he could control the ball more confidently under pressure. In September, Mr. Yamada chose Daiki to play in an official match for the first time, and although the team lost 2 to 1, Daiki managed to make an assist that led to their only goal.",
        "After the game, Daiki told his teammates, \"I'm still far from the best player on this team, but for the first time, I felt like I truly belonged out there.\" He has continued his morning practice ever since."
      ],
      "items": [
        {
          "text": "What was Daiki's situation when he first joined the soccer team?",
          "options": [
            "He was already one of the best players.",
            "He had never played soccer competitively before.",
            "He was the team's captain.",
            "He had played soccer since elementary school."
          ],
          "answer": 1,
          "explain": "「never played soccer competitively before」から2が正解です。"
        },
        {
          "text": "What did Mr. Yamada tell Daiki after the difficult practice?",
          "options": [
            "That he should switch to a different sport.",
            "That he should quit the team.",
            "That what matters is what you do after failing.",
            "That he was not talented enough for soccer."
          ],
          "answer": 2,
          "explain": "「What matters is what you do after you fail」から2が正解です。"
        },
        {
          "text": "What did Daiki start doing every morning?",
          "options": [
            "Watching professional soccer games online.",
            "Helping his coach organize equipment.",
            "Running long distances around his neighborhood.",
            "Practicing basic ball control alone in a park."
          ],
          "answer": 3,
          "explain": "「he practiced simple dribbling and passing drills in the small park」から2が正解です。"
        },
        {
          "text": "What happened in September?",
          "options": [
            "Daiki was chosen to play in an official match for the first time.",
            "The team won the championship.",
            "Mr. Yamada retired as coach.",
            "Daiki quit the soccer team."
          ],
          "answer": 0,
          "explain": "「Mr. Yamada chose Daiki to play in an official match for the first time」から2が正解です。"
        },
        {
          "text": "How did Daiki feel after the match?",
          "options": [
            "Disappointed that the team lost.",
            "Like he truly belonged on the team.",
            "Ready to quit soccer for good.",
            "Angry at his teammates."
          ],
          "answer": 1,
          "explain": "「I felt like I truly belonged out there」から2が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "City Science Museum — New Dinosaur Exhibition",
      "passage": [
        "Starting November 1, the City Science Museum will open a new exhibition called \"Giants of the Past,\" featuring life-size dinosaur models and real fossils from around the world.",
        "School groups of 10 or more students can visit for a special group rate of 500 yen per student, instead of the regular 800 yen. Group visits must be booked at least two weeks in advance by calling the museum office.",
        "The exhibition also includes a hands-on area where visitors can touch replica fossils and try a simple fossil-digging activity, recommended for elementary and junior high school students."
      ],
      "items": [
        {
          "text": "How can a school group get a discount for the exhibition?",
          "options": [
            "By booking a group of 10 or more students two weeks in advance.",
            "By showing a student ID at the entrance.",
            "By bringing their own lunch.",
            "By visiting after 5:00 p.m."
          ],
          "answer": 0,
          "explain": "「School groups of 10 or more students ... booked at least two weeks in advance」から2が正解です。"
        },
        {
          "text": "What can visitors do in the hands-on area?",
          "options": [
            "Buy dinosaur toys and books.",
            "Touch replica fossils and try a fossil-digging activity.",
            "Watch a movie about dinosaurs.",
            "Meet a real paleontologist."
          ],
          "answer": 1,
          "explain": "「touch replica fossils and try a simple fossil-digging activity」から2が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Details for Next Week's Field Trip",
      "passage": [
        "<span class=\"label\">From</span> Ms. Green &nbsp; <span class=\"label\">To</span> Parents &nbsp; <span class=\"label\">Subject</span> Details for Next Week's Field Trip",
        "Dear Parents,",
        "I'm writing to share a few details about next Wednesday's field trip to Lakeside Nature Park.",
        "Students should arrive at school by 8:15 a.m., fifteen minutes earlier than usual, since the bus will leave promptly at 8:30. Please make sure your child brings a packed lunch, a water bottle, and comfortable walking shoes, as we will be hiking for about two hours in the morning.",
        "We expect to return to school by 4:00 p.m., but please note that the exact time may change slightly depending on traffic. If your child has any allergies or medical needs we should know about, please contact the school office by Monday.",
        "Thank you for your cooperation. Ms. Green"
      ],
      "items": [
        {
          "text": "What time should students arrive at school on the day of the trip?",
          "options": [
            "9:00 a.m.",
            "8:00 a.m.",
            "8:15 a.m.",
            "8:30 a.m."
          ],
          "answer": 2,
          "explain": "「Students should arrive at school by 8:15 a.m.」から2が正解です。"
        },
        {
          "text": "What should students bring for the hiking part of the trip?",
          "options": [
            "A raincoat and umbrella.",
            "A camera and notebook.",
            "Extra money for souvenirs.",
            "A packed lunch, water, and comfortable shoes."
          ],
          "answer": 3,
          "explain": "「a packed lunch, a water bottle, and comfortable walking shoes」から1が正解です。"
        },
        {
          "text": "What does Ms. Green ask parents to do by Monday?",
          "options": [
            "Contact the school about any allergies or medical needs.",
            "Sign a permission form.",
            "Buy hiking shoes for their child.",
            "Pay for the bus tickets."
          ],
          "answer": 0,
          "explain": "「please contact the school office by Monday」の内容から2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "Learning to Listen with My Hands",
      "passage": [
        "When Kaito started his second year of high school, a new student named Riku joined his class. Riku was deaf and communicated mainly through sign language, with the help of a support teacher who sat near him during most classes. At first, Kaito wasn't sure how to talk to Riku, so like many of his classmates, he simply avoided the awkwardness by not talking to him much at all.",
        "One day during lunch, Kaito noticed Riku sitting alone while everyone else talked in groups. Feeling a bit guilty, Kaito searched online that night for simple Japanese Sign Language phrases, just enough to say \"hello\" and \"nice to meet you.\" The next day, he used those few signs with Riku, who smiled brightly and slowly signed something back, which Kaito couldn't understand at all.",
        "Instead of giving up, Kaito asked the support teacher if there were any beginner sign language lessons nearby. It turned out that the community center offered a free monthly class, so Kaito started attending, along with two curious classmates who joined him after hearing about it.",
        "Learning sign language wasn't easy — Kaito often mixed up similar signs and had to ask Riku to repeat things slowly. But over the following months, the two of them developed simple routines: greeting each other every morning, discussing homework, and even joking around using signs Kaito had picked up.",
        "By the end of the school year, Riku told Kaito, through the support teacher, that this was the first year at a hearing school where he had truly felt like part of the class. Kaito, in turn, said that learning sign language had taught him that real communication isn't only about words — it's about making the effort to understand someone else."
      ],
      "items": [
        {
          "text": "How did Kaito behave toward Riku at first?",
          "options": [
            "He became close friends with Riku right away.",
            "He avoided talking to Riku much at all.",
            "He asked the teacher to move Riku's seat.",
            "He taught Riku how to speak Japanese."
          ],
          "answer": 1,
          "explain": "「he simply avoided the awkwardness by not talking to him much at all」から2が正解です。"
        },
        {
          "text": "What made Kaito decide to learn some sign language?",
          "options": [
            "He wanted extra credit in a class.",
            "A teacher required all students to learn it.",
            "He saw Riku sitting alone at lunch and felt guilty.",
            "Riku asked him directly to learn it."
          ],
          "answer": 2,
          "explain": "「Kaito noticed Riku sitting alone ... Feeling a bit guilty」から2が正解です。"
        },
        {
          "text": "Where did Kaito find a sign language class?",
          "options": [
            "Online through a video course.",
            "At Riku's house.",
            "At his high school.",
            "At a community center."
          ],
          "answer": 3,
          "explain": "「the community center offered a free monthly class」から2が正解です。"
        },
        {
          "text": "What was difficult about learning sign language for Kaito?",
          "options": [
            "He often mixed up similar signs.",
            "Riku refused to help him practice.",
            "The community center class was too expensive.",
            "He had no time to attend the classes."
          ],
          "answer": 0,
          "explain": "「Kaito often mixed up similar signs」から2が正解です。"
        },
        {
          "text": "What did Kaito say he learned by the end of the school year?",
          "options": [
            "That sign language is too difficult to learn.",
            "That real communication is about making the effort to understand someone.",
            "That he should have ignored Riku from the start.",
            "That support teachers should do all the communicating."
          ],
          "answer": 1,
          "explain": "最終文「real communication ... is about making the effort to understand someone else」から2が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Green Committee Notice — Bottle Cap Collection Drive",
      "passage": [
        "The school's Green Committee is collecting plastic bottle caps from October 1 to November 30. Collection boxes are placed in the entrance hall of each school building.",
        "Collected caps will be sent to a recycling company, which will turn them into new plastic products and donate part of the profit to support vaccines for children in developing countries. According to the organization, about 800 caps are needed to fund one vaccine.",
        "Each homeroom class that collects more than 500 caps will receive a certificate of appreciation at the December assembly. Please make sure the caps are clean and dry before placing them in the boxes."
      ],
      "items": [
        {
          "text": "What will happen to the collected bottle caps?",
          "options": [
            "They will be recycled, and some profit will support vaccines for children.",
            "They will be sold at the school festival.",
            "They will be returned to the students who collected them.",
            "They will be thrown away after the drive ends."
          ],
          "answer": 0,
          "explain": "「turn them into new plastic products and donate part of the profit to support vaccines」から2が正解です。"
        },
        {
          "text": "What is required before placing caps in the collection boxes?",
          "options": [
            "The caps must be a certain color.",
            "The caps must be clean and dry.",
            "Students must write their name on each cap.",
            "The caps must all be the same size."
          ],
          "answer": 1,
          "explain": "「Please make sure the caps are clean and dry」から2が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Beach cleanup this Sunday?",
      "passage": [
        "<span class=\"label\">From</span> Mia &nbsp; <span class=\"label\">To</span> Sam &nbsp; <span class=\"label\">Subject</span> Beach cleanup this Sunday?",
        "Hi Sam,",
        "A group of us from the environmental club are organizing a beach cleanup this Sunday morning at Sunset Beach, from 9:00 to 11:00. Would you like to join us? We're hoping to collect as much plastic trash as possible before the tourist season starts again.",
        "The city is providing gloves and trash bags, so you don't need to bring your own, but please wear old clothes and shoes you don't mind getting a little dirty. We're meeting at the beach's main entrance at 8:45.",
        "Afterward, a few of us are planning to grab lunch together near the station, if you'd like to come along for that too. Let me know by Friday if you can make it, so I can tell the organizers how many people to expect.",
        "Mia"
      ],
      "items": [
        {
          "text": "What is the purpose of Sunday's event?",
          "options": [
            "To raise money for a new club uniform.",
            "To plant new trees near the beach.",
            "To collect plastic trash from the beach.",
            "To teach swimming lessons to children."
          ],
          "answer": 2,
          "explain": "「to collect as much plastic trash as possible」から2が正解です。"
        },
        {
          "text": "What does Mia say Sam does NOT need to bring?",
          "options": [
            "Old clothes.",
            "Comfortable shoes.",
            "A water bottle.",
            "Gloves and trash bags."
          ],
          "answer": 3,
          "explain": "「The city is providing gloves and trash bags, so you don't need to bring your own」から1が正解です。"
        },
        {
          "text": "What does Mia ask Sam to do by Friday?",
          "options": [
            "Let her know if he can join, for the organizers.",
            "Pay for his lunch in advance.",
            "Bring a friend along.",
            "Buy his own gloves."
          ],
          "answer": 0,
          "explain": "「Let me know by Friday if you can make it, so I can tell the organizers」から2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "Through the Lens",
      "passage": [
        "Hiro had never thought much about photography until his art teacher took the class on a field trip to a photography exhibition downtown. Most of the photos showed ordinary scenes — a crowded train station, an old man feeding pigeons, rain falling on a quiet street — yet somehow each image made Hiro feel something he couldn't quite explain.",
        "After the trip, Hiro asked his teacher how someone could learn to take photos like that. His teacher smiled and told him, \"You don't need an expensive camera to start. Just look closely at ordinary things, and try to notice what makes them interesting.\" Encouraged by this advice, Hiro began using his old smartphone to photograph small scenes around his neighborhood: a cat sleeping in a flower pot, steam rising from a bowl of ramen, his grandmother's wrinkled hands while she was knitting.",
        "At first, Hiro felt embarrassed showing his photos to anyone, worried they weren't good enough compared to the exhibition he had seen. Still, he decided to share a few on the school's art club bulletin board, just to see what people thought. To his surprise, several classmates stopped to look, and one even asked if he could take her portrait for a class project.",
        "Over the following months, Hiro's photography noticeably improved as he experimented with different angles and lighting. By the end of the year, three of his photos were chosen to be displayed in the school's annual art exhibition, right next to paintings and drawings from older students.",
        "Hiro later said, \"I used to think photography was only for people with fancy equipment. Now I know it's really about paying attention to the world around you.\""
      ],
      "items": [
        {
          "text": "What inspired Hiro's interest in photography?",
          "options": [
            "A photography club he was forced to join.",
            "A photography exhibition his class visited.",
            "A gift of a new camera from his parents.",
            "A photography competition at his school."
          ],
          "answer": 1,
          "explain": "「his art teacher took the class on a field trip to a photography exhibition」から1が正解です。"
        },
        {
          "text": "What advice did Hiro's teacher give him?",
          "options": [
            "To wait until he was older to start.",
            "To buy an expensive camera first.",
            "To look closely at ordinary things.",
            "To copy photos from famous photographers."
          ],
          "answer": 2,
          "explain": "「Just look closely at ordinary things」から2が正解です。"
        },
        {
          "text": "How did Hiro feel about sharing his photos at first?",
          "options": [
            "Angry that no one appreciated his work.",
            "Uninterested in showing anyone.",
            "Extremely confident and proud.",
            "Embarrassed, worried they weren't good enough."
          ],
          "answer": 3,
          "explain": "「Hiro felt embarrassed showing his photos to anyone」から2が正解です。"
        },
        {
          "text": "What happened after Hiro shared his photos on the bulletin board?",
          "options": [
            "Several classmates stopped to look, and one asked for a portrait.",
            "The art teacher asked him to stop sharing photos.",
            "His photos were removed from the board.",
            "No one noticed his photos at all."
          ],
          "answer": 0,
          "explain": "「several classmates stopped to look, and one even asked if he could take her portrait」から2が正解です。"
        },
        {
          "text": "What did Hiro learn about photography by the end of the year?",
          "options": [
            "That it requires very expensive equipment.",
            "That it is really about paying attention to the world around you.",
            "That only professional photographers can be successful.",
            "That he should focus on painting instead."
          ],
          "answer": 1,
          "explain": "最終文「it's really about paying attention to the world around you」から2が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Maple City Job Information Fair for High School Students",
      "passage": [
        "Date: Saturday, November 8, 1:00–4:00 p.m. &nbsp;|&nbsp; Place: Maple City Community Hall.",
        "This event connects high school students aged 16 and older with local businesses offering part-time jobs, including cafés, bookstores, and supermarkets. Representatives from each business will be available to answer questions and accept simple applications on the spot.",
        "Students should bring a copy of their school ID and, if possible, a short note from a parent or guardian giving permission to work part-time. The event is free to attend, and no reservation is required."
      ],
      "items": [
        {
          "text": "Who can attend the job information fair?",
          "options": [
            "High school students aged 16 and older.",
            "Only students who already have a job.",
            "Anyone over the age of 20.",
            "Only university students."
          ],
          "answer": 0,
          "explain": "「high school students aged 16 and older」から2が正解です。"
        },
        {
          "text": "What should students bring to the event?",
          "options": [
            "A resume written by a teacher.",
            "A school ID and, if possible, parental permission.",
            "Money to pay an entrance fee.",
            "A reservation ticket printed in advance."
          ],
          "answer": 1,
          "explain": "「a copy of their school ID and ... a short note from a parent or guardian giving permission」から2が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Sorry for missing today's meeting",
      "passage": [
        "<span class=\"label\">From</span> Yui &nbsp; <span class=\"label\">To</span> Mr. Sato &nbsp; <span class=\"label\">Subject</span> Sorry for missing today's meeting",
        "Dear Mr. Sato,",
        "I'm very sorry that I wasn't able to attend today's student council meeting. My train was delayed for almost an hour because of a signal problem, and by the time I arrived at school, the meeting had already ended.",
        "Could you please let me know what was discussed today, or if there are any tasks I need to complete before the next meeting? I don't want to fall behind the other members.",
        "Also, would it be possible to meet with you briefly sometime this week so I can catch up on anything important? I'm free after school any day except Thursday.",
        "I apologize again for the inconvenience. Yui"
      ],
      "items": [
        {
          "text": "Why did Yui miss today's meeting?",
          "options": [
            "She had another club meeting at the same time.",
            "She forgot about the meeting completely.",
            "Her train was delayed because of a signal problem.",
            "She was sick and stayed home."
          ],
          "answer": 2,
          "explain": "「My train was delayed for almost an hour because of a signal problem」から2が正解です。"
        },
        {
          "text": "What does Yui ask Mr. Sato to tell her?",
          "options": [
            "The names of the other club members.",
            "The date of the next school festival.",
            "The location of the next meeting.",
            "What was discussed and any tasks she needs to complete."
          ],
          "answer": 3,
          "explain": "「let me know what was discussed today, or if there are any tasks I need to complete」から2が正解です。"
        },
        {
          "text": "When is Yui NOT available to meet this week?",
          "options": [
            "Thursday.",
            "Friday.",
            "Monday.",
            "Wednesday."
          ],
          "answer": 0,
          "explain": "「I'm free after school any day except Thursday」から3が正解です。"
        }
      ]
    },
    "partC": {
      "title": "The Show Must Go On",
      "passage": [
        "When Miu was chosen for the lead role in her class's play for the school festival, most of her classmates were thrilled for her. Miu, however, felt nothing but panic. She had never performed in front of a large audience before, and just imagining hundreds of parents and students watching her made her stomach hurt.",
        "For the first two weeks of rehearsal, Miu could barely say her lines above a whisper, even though she had memorized every word perfectly at home. Her classmate Yuna, who was directing the play, noticed this and suggested something unusual: instead of practicing in the classroom, why not rehearse outside, in the school courtyard, where more people could see and hear them?",
        "At first, Miu thought this idea would make things worse, not better. But Yuna explained, \"If you can say your lines confidently where people are passing by and glancing at you, the actual stage will feel much easier.\" Reluctantly, Miu agreed to try it for just one week.",
        "It was uncomfortable at first — she noticed teachers and students stopping to watch, which made her face turn red. But slowly, day by day, she stopped noticing the passersby as much, and her voice grew steadier and louder.",
        "On the day of the festival, standing backstage, Miu's hands were still shaking slightly. But once the curtain opened and she said her first line, she found that her voice came out clear and strong, just as it had in the courtyard. The play was a success, and her teacher told her afterward that her performance had improved more than anyone else's in the class.",
        "Miu later told Yuna, \"I never thought practicing in public would actually make the real thing easier. Thank you for pushing me to try it.\""
      ],
      "items": [
        {
          "text": "How did Miu feel when she was chosen for the lead role?",
          "options": [
            "Extremely proud and confident.",
            "Panicked, since she had never performed in front of a large audience.",
            "Angry that she was chosen instead of a friend.",
            "Uninterested in the school play."
          ],
          "answer": 1,
          "explain": "「Miu ... felt nothing but panic」から2が正解です。"
        },
        {
          "text": "What problem did Miu have during the first two weeks of rehearsal?",
          "options": [
            "She argued with the director.",
            "She couldn't memorize her lines.",
            "She could barely say her lines above a whisper.",
            "She kept missing rehearsals."
          ],
          "answer": 2,
          "explain": "「Miu could barely say her lines above a whisper」から2が正解です。"
        },
        {
          "text": "What did Yuna suggest to help Miu?",
          "options": [
            "Giving the lead role to someone else.",
            "Skipping rehearsal for a week to relax.",
            "Practicing alone at home every night.",
            "Rehearsing outside in the school courtyard."
          ],
          "answer": 3,
          "explain": "「rehearse outside, in the school courtyard, where more people could see and hear them」から2が正解です。"
        },
        {
          "text": "What happened as Miu practiced in the courtyard over time?",
          "options": [
            "She stopped noticing the passersby as much, and her voice grew steadier.",
            "She asked to switch to a smaller role.",
            "She became too tired to perform well.",
            "She refused to continue after the first day."
          ],
          "answer": 0,
          "explain": "「she stopped noticing the passersby as much, and her voice grew steadier and louder」から2が正解です。"
        },
        {
          "text": "How did Miu's performance turn out on the day of the festival?",
          "options": [
            "She forgot her lines completely.",
            "Her voice came out clear and strong, and the play was a success.",
            "She refused to go on stage.",
            "The teacher said her performance was the weakest in the class."
          ],
          "answer": 1,
          "explain": "「her voice came out clear and strong ... The play was a success」から2が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Hillcrest Public Library — Summer Used Book Sale",
      "passage": [
        "Date: Saturday, August 2 and Sunday, August 3, 10:00 a.m. – 5:00 p.m. &nbsp;|&nbsp; Place: Library main hall.",
        "Thousands of used books, including novels, comic books, and children's picture books, will be sold for between 50 and 300 yen each. All proceeds will go toward buying new books for the library's collection.",
        "Donations of gently used books are also welcome and can be dropped off at the front desk until July 26. Please note that textbooks and magazines cannot be accepted as donations."
      ],
      "items": [
        {
          "text": "What will happen to the money earned from the book sale?",
          "options": [
            "It will be used to buy new books for the library.",
            "It will be donated to a local school.",
            "It will be saved for next year's sale.",
            "It will be given to library staff as a bonus."
          ],
          "answer": 0,
          "explain": "「All proceeds will go toward buying new books for the library's collection」から2が正解です。"
        },
        {
          "text": "What can NOT be donated to the book sale?",
          "options": [
            "Comic books.",
            "Textbooks and magazines.",
            "Children's picture books.",
            "Novels."
          ],
          "answer": 1,
          "explain": "「textbooks and magazines cannot be accepted as donations」から3が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Surprise party for Ms. Kimura",
      "passage": [
        "<span class=\"label\">From</span> Kenta &nbsp; <span class=\"label\">To</span> Classmates &nbsp; <span class=\"label\">Subject</span> Surprise party for Ms. Kimura",
        "Hi everyone,",
        "As you probably know, Ms. Kimura is retiring at the end of this month after twenty years of teaching at our school. A few of us thought it would be nice to organize a small surprise farewell party for her during our last class together on the 28th.",
        "I've already asked the school office, and they said we can use the classroom for an extra thirty minutes after school that day. Could everyone bring something simple, like snacks, drinks, or decorations? Please reply to this email by next Monday and let me know what you'd like to bring, so we don't end up with the same thing from everyone.",
        "Also, if anyone is good at writing or drawing, we're thinking of making a large card with messages from the whole class. Let me know if you'd like to help with that too.",
        "Thanks, Kenta"
      ],
      "items": [
        {
          "text": "Why are Kenta and his classmates planning the party?",
          "options": [
            "To welcome a new teacher.",
            "To celebrate Ms. Kimura's birthday.",
            "To celebrate Ms. Kimura's retirement.",
            "To thank Ms. Kimura for a good grade."
          ],
          "answer": 2,
          "explain": "「Ms. Kimura is retiring ... organize a small surprise farewell party」から2が正解です。"
        },
        {
          "text": "What did the school office allow the students to do?",
          "options": [
            "Cancel classes for the whole day.",
            "Invite students from other schools.",
            "Leave school early on the 28th.",
            "Use the classroom for an extra thirty minutes after school."
          ],
          "answer": 3,
          "explain": "「they said we can use the classroom for an extra thirty minutes after school」から2が正解です。"
        },
        {
          "text": "Why does Kenta ask classmates to reply by Monday?",
          "options": [
            "So they don't all bring the same thing.",
            "So he can print the invitations.",
            "So Ms. Kimura can be informed in advance.",
            "So he can order a birthday cake."
          ],
          "answer": 0,
          "explain": "「so we don't end up with the same thing from everyone」から2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "From Grandma's Kitchen to the School Festival",
      "passage": [
        "Every Sunday afternoon, Emi used to sit in her grandmother's small kitchen, watching her bake traditional Japanese sweets that had been passed down through three generations of their family. For years, Emi thought of it simply as a nice way to spend time with her grandmother, never imagining it could become anything more.",
        "That changed in her second year of high school, when her class was asked to come up with an idea for a food stall at the school festival. While other groups planned to sell popular items like takoyaki or crepes, Emi suggested something different: dorayaki, a traditional pancake filled with sweet red bean paste, made using her grandmother's original recipe.",
        "Her classmates were a little unsure at first, worried that traditional sweets wouldn't be as popular as trendy festival food. Still, they agreed to let Emi lead the project, and her grandmother happily came to school one weekend to teach the whole group how to make the dorayaki batter and filling properly.",
        "In the weeks before the festival, Emi and her classmates practiced the recipe again and again, gradually improving their technique under her grandmother's patient guidance. On the day of the festival, they were nervous that customers might walk past their stall in favor of more modern food options.",
        "To everyone's surprise, the smell of freshly made dorayaki drew a long line of visitors, including several elderly guests who said it reminded them of sweets from their own childhood. The stall sold out completely by early afternoon, earning more money than any other food stall in their grade.",
        "Afterward, Emi's grandmother told her proudly, \"I never thought our little Sunday tradition would bring so many smiles to so many people.\" Emi has since decided to keep learning traditional recipes from her grandmother, hoping to one day open a small sweets shop of her own."
      ],
      "items": [
        {
          "text": "What did Emi and her grandmother do every Sunday afternoon?",
          "options": [
            "Emi taught her grandmother how to use a smartphone.",
            "Emi watched her grandmother bake traditional sweets.",
            "They went shopping together at the market.",
            "They practiced English conversation together."
          ],
          "answer": 1,
          "explain": "「Emi used to sit in her grandmother's small kitchen, watching her bake traditional Japanese sweets」から2が正解です。"
        },
        {
          "text": "What idea did Emi suggest for the class's food stall?",
          "options": [
            "Not having a food stall at all.",
            "Selling takoyaki, like most other groups.",
            "Selling dorayaki made with her grandmother's recipe.",
            "Selling crepes with modern toppings."
          ],
          "answer": 2,
          "explain": "「Emi suggested ... dorayaki ... made using her grandmother's original recipe」から2が正解です。"
        },
        {
          "text": "How did Emi's classmates feel about her idea at first?",
          "options": [
            "Completely against the idea.",
            "Uninterested in the food stall project.",
            "Extremely excited and confident.",
            "A little unsure, worried it wouldn't be popular."
          ],
          "answer": 3,
          "explain": "「Her classmates were a little unsure at first, worried that traditional sweets wouldn't be as popular」から2が正解です。"
        },
        {
          "text": "What happened at the festival?",
          "options": [
            "The stall sold out completely and earned the most money in their grade.",
            "The group ran out of ingredients before opening.",
            "Customers complained that the dorayaki tasted bad.",
            "Few customers visited the stall."
          ],
          "answer": 0,
          "explain": "「The stall sold out completely ... earning more money than any other food stall」から2が正解です。"
        },
        {
          "text": "What does Emi hope to do in the future?",
          "options": [
            "Stop making traditional sweets altogether.",
            "Open a small sweets shop of her own someday.",
            "Become a professional chef in a foreign country.",
            "Teach her grandmother how to bake modern desserts."
          ],
          "answer": 1,
          "explain": "最終文「hoping to one day open a small sweets shop of her own」から2が正解です。"
        }
      ]
    }
  },
  {
    "partA": {
      "title": "Notice: Fall Sports Day Schedule",
      "passage": [
        "This year's Sports Day will be held on Saturday, October 25, from 9:00 a.m. to 3:00 p.m. on the school grounds. In case of rain, the event will be postponed to Sunday, October 26.",
        "Events will include relay races, tug-of-war, and a folk dance performed by all first-year students. Parents and family members are welcome to watch and are asked to sit in the designated seating area near the main gate.",
        "Students should wear their P.E. uniform and bring a hat, a water bottle, and sunscreen. Lunch will be a break from 12:00 to 1:00 p.m., during which students may eat with their families on the grounds."
      ],
      "items": [
        {
          "text": "What will happen if it rains on October 25?",
          "options": [
            "Sports Day will be postponed to October 26.",
            "Only the folk dance will be canceled.",
            "Sports Day will be canceled completely.",
            "Sports Day will be moved indoors."
          ],
          "answer": 0,
          "explain": "「the event will be postponed to Sunday, October 26」から3が正解です。"
        },
        {
          "text": "What are students asked to bring?",
          "options": [
            "A costume for the folk dance.",
            "A hat, water bottle, and sunscreen.",
            "A packed lunch for the whole family.",
            "Their own chairs for seating."
          ],
          "answer": 1,
          "explain": "「bring a hat, a water bottle, and sunscreen」から1が正解です。"
        }
      ]
    },
    "partB": {
      "title": "Email: Exciting news about my trip!",
      "passage": [
        "<span class=\"label\">From</span> Sophie &nbsp; <span class=\"label\">To</span> Nanami &nbsp; <span class=\"label\">Subject</span> Exciting news about my trip!",
        "Hi Nanami,",
        "I have some exciting news! My parents finally agreed to let me visit Japan next spring during my school break. We're planning to arrive on March 20 and stay for about ten days.",
        "I would love to finally meet you in person after writing letters for almost two years! Would it be possible to meet up sometime during our trip, maybe for lunch or to visit a museum together? My family is also hoping to see Kyoto and Osaka, in addition to Tokyo, so if you have any recommendations for places to visit, I'd really appreciate it.",
        "Also, is there anything special I should bring as a gift for your family? I want to bring something from Canada that they might enjoy.",
        "I can't wait to finally see you in person! Sophie"
      ],
      "items": [
        {
          "text": "What is Sophie's exciting news?",
          "options": [
            "She got accepted into a Japanese university.",
            "She won a writing contest.",
            "She is going to visit Japan next spring.",
            "She is moving to Japan permanently."
          ],
          "answer": 2,
          "explain": "「My parents finally agreed to let me visit Japan next spring」から2が正解です。"
        },
        {
          "text": "What does Sophie ask Nanami for?",
          "options": [
            "Help translating a letter into Japanese.",
            "A place to stay during her visit.",
            "Money to help pay for her trip.",
            "Recommendations for places to visit in Kyoto and Osaka."
          ],
          "answer": 3,
          "explain": "「if you have any recommendations for places to visit, I'd really appreciate it」から2が正解です。"
        },
        {
          "text": "What else does Sophie ask about in her email?",
          "options": [
            "What gift she should bring for Nanami's family.",
            "How to say basic phrases in Japanese.",
            "What Nanami's favorite subject in school is.",
            "What time Nanami usually wakes up."
          ],
          "answer": 0,
          "explain": "「is there anything special I should bring as a gift for your family?」から2が正解です。"
        }
      ]
    },
    "partC": {
      "title": "Finding My Words",
      "passage": [
        "Haruto had always been more comfortable with numbers than with people. He enjoyed solving math problems alone in his room far more than talking in front of a group, and he often let his more outgoing classmates do the talking during group projects. So when his homeroom teacher suggested that he run for student council in his second year, Haruto laughed and said there was no way he would win, or even want to.",
        "However, his close friend Sora, who was already on the student council, kept encouraging him. \"You don't need to be the loudest person to have good ideas,\" Sora told him. \"You just need to be willing to share them.\" After weeks of hesitation, Haruto finally agreed to run for the position of treasurer, a role that seemed to match his strength with numbers.",
        "To his surprise, Haruto won the election, partly because classmates trusted him to manage the student council's budget carefully. Still, the position required more than just math skills — he had to explain budget decisions at weekly meetings, answer questions from other students, and sometimes disagree respectfully with older council members.",
        "At first, Haruto's voice would shake whenever he had to speak at meetings, and he often let others finish his sentences for him. Slowly, though, with Sora's encouragement and regular practice, he began speaking more clearly and confidently, even learning to explain complicated budget numbers in a simple way that everyone could understand.",
        "By the end of the school year, Haruto was chosen to present the entire student council's yearly report at the school assembly, something he never imagined himself doing a year earlier. Afterward, he told Sora, \"I still prefer numbers to speeches, but now I know I can do both when I need to.\""
      ],
      "items": [
        {
          "text": "What was Haruto more comfortable doing than talking to people?",
          "options": [
            "Playing sports.",
            "Solving math problems alone.",
            "Drawing pictures.",
            "Reading novels."
          ],
          "answer": 1,
          "explain": "「He enjoyed solving math problems alone in his room」から2が正解です。"
        },
        {
          "text": "What role did Haruto decide to run for?",
          "options": [
            "President.",
            "Vice president.",
            "Treasurer.",
            "Secretary."
          ],
          "answer": 2,
          "explain": "「Haruto finally agreed to run for the position of treasurer」から3が正解です。"
        },
        {
          "text": "Why did classmates trust Haruto in the election?",
          "options": [
            "He promised to reduce school rules.",
            "He was the tallest student in his grade.",
            "He was the most popular student in school.",
            "He was good with numbers and could manage the budget."
          ],
          "answer": 3,
          "explain": "「classmates trusted him to manage the student council's budget carefully」から2が正解です。"
        },
        {
          "text": "What happened to Haruto at meetings at first?",
          "options": [
            "His voice would shake and others often finished his sentences.",
            "He argued loudly with everyone.",
            "He was asked to leave the council.",
            "He refused to attend any meetings."
          ],
          "answer": 0,
          "explain": "「Haruto's voice would shake ... he often let others finish his sentences for him」から2が正解です。"
        },
        {
          "text": "What did Haruto do by the end of the school year?",
          "options": [
            "He quit the student council.",
            "He presented the student council's yearly report at the school assembly.",
            "He stopped being treasurer.",
            "He refused to speak at any more meetings."
          ],
          "answer": 1,
          "explain": "「Haruto was chosen to present the entire student council's yearly report at the school assembly」から2が正解です。"
        }
      ]
    }
  }
];
