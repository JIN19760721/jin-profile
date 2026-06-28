"use client";
import { useState } from "react";
import FlashCard from "./FlashCard";
import Quiz      from "./Quiz";
import ReviewTab from "./ReviewTab";
import type { Word, Phrase }           from "../data/vocabulary";
import type { ReviewItem, ReviewItemType } from "../hooks/useReviewList";
import type { StudyHistory }           from "../hooks/useStudyHistory";

type Tab = "home" | "words" | "parts" | "ai" | "weakness" | "mock" | "history" | "review";
type TLevel = "全て" | "TOEIC600" | "TOEIC730" | "TOEIC860";

const SESSION = 20;

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

const PART_INFO = [
  { part: 1, name: "写真描写問題", icon: "🖼️", questions: 6,
    desc: "1枚の写真について4つの説明文を聴き、最も適切なものを選ぶ。",
    tips: ["写真の主語・動詞・状態に注目", "can see / is being などの進行受動態に注意", "消去法を活用する", "先読みは写真のみ（選択肢は印刷されていない）"],
  },
  { part: 2, name: "応答問題", icon: "🎤", questions: 25,
    desc: "質問や発言に対して最も適切な応答を3つの選択肢から選ぶ。",
    tips: ["Who/What/Where/When/Why/How の疑問詞を聴き取る", "Yes/No で答えられない疑問文に注意", "間接的な答えが正解のことも多い", "最初の単語を必ず聴き取る"],
  },
  { part: 3, name: "会話問題", icon: "💬", questions: 39,
    desc: "2〜3人の会話を聴き、問題用紙の設問に答える。",
    tips: ["設問を先読みして何を聴くべきか把握する", "場所・目的・次の行動を問われることが多い", "グラフや図表との連携問題に注意", "会話全体の流れを理解する"],
  },
  { part: 4, name: "説明文問題", icon: "📢", questions: 30,
    desc: "1人のナレーターによる説明・アナウンスを聴き、設問に答える。",
    tips: ["設問を先読みして話題を予測する", "数字・日時・場所情報をメモする", "広告・アナウンス・留守電などのパターンを覚える", "冒頭の文で話題が判明することが多い"],
  },
  { part: 5, name: "短文穴埋め問題", icon: "📝", questions: 30,
    desc: "短文の空欄に最も適切な語句を4つの選択肢から選ぶ。",
    tips: ["品詞問題（名詞/動詞/形容詞/副詞）を素早く判断する", "文法問題（時制・態・一致）を確実に取る", "語彙問題はコロケーションで判断する", "文脈不要の構造問題から解く"],
    hasPractice: true,
  },
  { part: 6, name: "長文穴埋め問題", icon: "📄", questions: 16,
    desc: "メールや記事などの長文の空欄4か所を埋める。",
    tips: ["文章全体の流れを把握してから解く", "文挿入問題は前後の接続詞・代名詞に注目", "適切な時制・一致を確認する", "語彙は文書の文脈から選ぶ"],
  },
  { part: 7, name: "読解問題", icon: "📖", questions: 54,
    desc: "メール・記事・広告などの文書を読み、設問に答える。",
    tips: ["設問を先読みして必要な情報を絞る", "NOT問題は時間がかかるので後回し", "パラフレーズ（言い換え）を見抜く", "複数文書の問題は共通テーマを探す"],
  },
];

const AI_TIPS = [
  { title: "TOEIC 高スコアの秘訣", icon: "🎯",
    content: "TOEICは「英語力」ではなく「TOEIC力」を測るテスト。出題パターンを熟知することが最短ルートです。リスニングはPart2の応答問題、リーディングはPart5の文法・語彙が最も効率的な得点源です。" },
  { title: "語彙学習の戦略", icon: "📚",
    content: "TOEIC頻出語彙は「ビジネス英語」が中心。announce/implement/facilitate などの動詞、及びそのコロケーション（組み合わせ）を覚えることが重要。単語単体ではなく例文ごと覚えましょう。" },
  { title: "時間配分のコツ", icon: "⏱️",
    content: "リーディング75分でPart5(30問)→Part6(16問)→Part7(54問)の順に解く。Part5は1問20秒、Part6は1文書3分、Part7のシングル文書は2〜3分、複数文書は4〜5分が目安。時間配分の練習が重要。" },
  { title: "リスニング強化法", icon: "🎧",
    content: "シャドーイング（音声を聴きながら追いかけるように発音）が最も効果的。毎日10分のシャドーイングで音の認識力が飛躍的に向上。本番では先読みで設問の キーワードを把握してから音声を聴く。" },
  { title: "スコア目標別学習法", icon: "📈",
    content: "600点目標：基本文法とPart2・5を完璧に。730点目標：語彙強化とPart3・4の先読み習得。860点目標：速読力とPart7の精読力、高度な語彙が必須。自分のスコア帯の弱点を集中的に克服。" },
];

interface Props {
  vocabulary:    Word[];
  phrases:       Phrase[];
  reviewItems:   ReviewItem[];
  onToggle:      (type: ReviewItemType, id: number) => void;
  onRemove:      (type: ReviewItemType, id: number) => void;
  isInList:      (type: ReviewItemType, id: number) => boolean;
  history:       StudyHistory;
  addRecord:     (r: Omit<import("../hooks/useStudyHistory").QuizRecord, "date">) => void;
  wrongIds:      Set<number>;
  onWrong:       (id: number) => void;
  onRemoveWrong: (id: number) => void;
  onClearWrong:  () => void;
  onBack:        () => void;
}

type QuizSource = "all" | "wrong";

export default function TOEICMode({
  vocabulary, phrases, reviewItems, onToggle, onRemove, isInList, history, addRecord,
  wrongIds, onWrong, onRemoveWrong, onClearWrong, onBack,
}: Props) {
  const toeicVocab = vocabulary.filter((w) =>
    w.level === "TOEIC600" || w.level === "TOEIC730" || w.level === "TOEIC860"
  );

  const [activeTab,        setActiveTab]        = useState<Tab>("home");
  const [tLevel,           setTLevel]           = useState<TLevel>("全て");
  const [cardIndex,        setCardIndex]        = useState(0);
  const [flashWords,       setFlashWords]       = useState<Word[]>(() => pickRandom(toeicVocab, SESSION));
  const [quizWords,        setQuizWords]        = useState<Word[]>(() => pickRandom(toeicVocab, SESSION));
  const [quizKey,          setQuizKey]          = useState(0);
  const [selPart,          setSelPart]          = useState<number | null>(null);
  const [mockKey,          setMockKey]          = useState(0);
  const [mockWords,        setMockWords]        = useState<Word[]>(() => pickRandom(toeicVocab, 40));
  const [quizSource,       setQuizSource]       = useState<QuizSource>("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const reviewCount = reviewItems.length;
  const wrongCount  = wrongIds.size;
  const safeIndex   = flashWords.length > 0 ? cardIndex % flashWords.length : 0;
  const wrongWords  = toeicVocab.filter((w) => wrongIds.has(w.id));

  const levelPool = (lv: TLevel) =>
    lv === "全て" ? toeicVocab : toeicVocab.filter((w) => w.level === lv);

  const handleLevelChange = (lv: TLevel) => {
    setTLevel(lv);
    setCardIndex(0);
    setFlashWords(pickRandom(levelPool(lv), SESSION));
  };
  const shuffleFlash = () => { setCardIndex(0); setFlashWords(pickRandom(levelPool(tLevel), SESSION)); };
  const shuffleQuiz  = () => {
    const pool = quizSource === "wrong" ? wrongWords : levelPool(tLevel);
    setQuizWords(pickRandom(pool, Math.min(SESSION, pool.length)));
    setQuizKey((k) => k + 1);
  };
  const handleSourceChange = (src: QuizSource) => {
    setQuizSource(src);
    const pool = src === "wrong" ? wrongWords : levelPool(tLevel);
    if (pool.length > 0) {
      setQuizWords(pickRandom(pool, Math.min(SESSION, pool.length)));
      setQuizKey((k) => k + 1);
    }
  };
  const newMock      = () => { setMockWords(pickRandom(toeicVocab, 40)); setMockKey((k) => k + 1); };

  const lCounts = {
    "TOEIC600": toeicVocab.filter((w) => w.level === "TOEIC600").length,
    "TOEIC730": toeicVocab.filter((w) => w.level === "TOEIC730").length,
    "TOEIC860": toeicVocab.filter((w) => w.level === "TOEIC860").length,
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "home",     label: "ホーム", icon: "🏠" },
    { id: "words",    label: "単語",   icon: "📚" },
    { id: "parts",    label: "Part",   icon: "📝" },
    { id: "mock",     label: "模試",   icon: "🏆" },
    { id: "weakness", label: "弱点",   icon: "📈" },
    { id: "review",   label: "復習",   icon: "⭐" },
  ];

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", position: "relative" }}>
      {/* ヘッダー */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#0f172a", borderBottom: "1px solid #1e293b",
        paddingTop: "max(10px,env(safe-area-inset-top))",
      }}>
        {/* 1行目：戻るボタン・タイトル・バッジ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "0 16px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack}
              style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px",
                       color: "#94a3b8", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>
              ‹
            </button>
            <h1 style={{ fontSize: 17, fontWeight: 700, whiteSpace: "nowrap" }}>📊 TOEIC対策</h1>
          </div>
          {wrongCount > 0 && (
            <button onClick={() => { handleSourceChange("wrong"); setActiveTab("words"); }}
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "none",
                       borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600,
                       cursor: "pointer", flexShrink: 0 }}>
              ❌ 苦手 {wrongCount}
            </button>
          )}
        </div>
        {/* 2行目：レベル選択 */}
        <div style={{ display: "flex", gap: 6, padding: "0 16px 10px", overflowX: "auto" }}>
          {(["全て","TOEIC600","TOEIC730","TOEIC860"] as TLevel[]).map((lv) => (
            <button key={lv} onClick={() => handleLevelChange(lv)}
              style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                       border: "none", cursor: "pointer", flexShrink: 0,
                       background: tLevel === lv ? "#0e7490" : "#1e293b",
                       color:      tLevel === lv ? "#fff"    : "#64748b" }}>
              {lv === "全て" ? "ALL" : lv}
            </button>
          ))}
        </div>
      </header>

      <main style={{ padding: "20px 16px 100px" }}>

        {/* ── ホーム ──────────────────────────────── */}
        {activeTab === "home" && (
          <TOEICHome
            toeicVocab={toeicVocab} lCounts={lCounts}
            history={history} reviewCount={reviewCount} wrongCount={wrongCount}
            onNavigate={(tab) => {
              if (tab === "words" && wrongCount > 0) handleSourceChange("wrong");
              setActiveTab(tab);
            }}
          />
        )}

        {/* ── 単語学習 ─────────────────────────────── */}
        {activeTab === "words" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>TOEIC 単語学習</h2>
                <p style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                  {levelPool(tLevel).length} 語からランダム {Math.min(SESSION, flashWords.length)} 語
                </p>
              </div>
              <button onClick={shuffleFlash} style={sBtn("#164e63","#67e8f9","#155e75")}>
                🔀 シャッフル
              </button>
            </div>
            {flashWords.length > 0 ? (
              <FlashCard
                word={flashWords[safeIndex]}
                current={safeIndex + 1} total={flashWords.length}
                onNext={() => setCardIndex((i) => (i + 1) % flashWords.length)}
                onPrev={() => setCardIndex((i) => (i - 1 + flashWords.length) % flashWords.length)}
                isReviewed={isInList("word", flashWords[safeIndex].id)}
                onToggleReview={() => onToggle("word", flashWords[safeIndex].id)}
              />
            ) : (
              <p style={{ color: "#64748b", textAlign: "center", padding: "40px 0" }}>単語がありません</p>
            )}

            {/* 単語クイズ */}
            <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <p style={{ color: "#e2e8f0", fontWeight: 600 }}>単語クイズ</p>
                  <p style={{ color: "#64748b", fontSize: 12 }}>
                    {quizSource === "wrong"
                      ? `苦手単語 ${wrongWords.length} 語から ${quizWords.length} 問`
                      : `${levelPool(tLevel).length} 語からランダム ${quizWords.length} 問`}
                  </p>
                </div>
                <button onClick={shuffleQuiz} style={sBtn("#431407","#fdba74","#7c2d12")}>
                  🔀 新しい問題
                </button>
              </div>

              {/* 出題ソース切替 */}
              <div style={{ display: "flex", gap: 6, background: "#1e293b",
                            borderRadius: 12, padding: 4, marginBottom: 12 }}>
                {(["all", "wrong"] as QuizSource[]).map((src) => {
                  const label  = src === "all" ? "全単語から出題" : `苦手単語から出題 (${wrongCount})`;
                  const active = quizSource === src;
                  return (
                    <button key={src} onClick={() => handleSourceChange(src)}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "none",
                               cursor: "pointer", fontSize: 12, fontWeight: 600,
                               background: active ? (src === "wrong" ? "#991b1b" : "#0e7490") : "transparent",
                               color:      active ? "#fff" : "#64748b" }}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {quizSource === "wrong" && wrongWords.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 20px",
                              background: "#0f172a", borderRadius: 14, border: "1px solid #1e293b" }}>
                  <p style={{ fontSize: 32, marginBottom: 8 }}>🎉</p>
                  <p style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700 }}>苦手単語がありません！</p>
                  <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>クイズで間違えた単語がここに表示されます</p>
                </div>
              ) : (
                <Quiz key={quizKey} words={quizWords} pool={toeicVocab} mode="toeic" onWrong={onWrong}
                  onComplete={(score, total) => addRecord({ mode: "toeic", level: tLevel, score, total })} />
              )}

              {/* 苦手単語リスト */}
              {quizSource === "wrong" && wrongWords.length > 0 && (
                <div style={{ marginTop: 16, background: "#0f172a", border: "1px solid #1e293b",
                              borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <p style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>苦手単語リスト ({wrongWords.length}語)</p>
                    {showClearConfirm ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { onClearWrong(); setShowClearConfirm(false); setQuizSource("all"); }}
                          style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 8,
                                   padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
                          リセット確認
                        </button>
                        <button onClick={() => setShowClearConfirm(false)}
                          style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8,
                                   padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setShowClearConfirm(true)}
                        style={{ color: "#64748b", fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>
                        リセット
                      </button>
                    )}
                  </div>
                  {wrongWords.slice(0, 10).map((w) => (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10,
                                             padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{w.english}</span>
                        <span style={{ color: "#64748b", fontSize: 12, marginLeft: 8 }}>{w.japanese}</span>
                      </div>
                      <button onClick={() => onRemoveWrong(w.id)}
                        style={{ background: "none", border: "none", color: "#475569",
                                 cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>
                        ×
                      </button>
                    </div>
                  ))}
                  {wrongWords.length > 10 && (
                    <p style={{ color: "#475569", fontSize: 12, marginTop: 6, textAlign: "center" }}>
                      他 {wrongWords.length - 10} 語
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Part 1〜7 学習 ───────────────────────── */}
        {activeTab === "parts" && (
          selPart === null ? (
            <TOEICPartsMenu onSelect={setSelPart} />
          ) : (
            <TOEICPartDetail
              part={PART_INFO[selPart]}
              vocab={toeicVocab}
              isInList={isInList} onToggle={onToggle}
              onBack={() => setSelPart(null)}
              addRecord={addRecord}
            />
          )
        )}

        {/* ── AI解説 ─────────────────────────────────── */}
        {activeTab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>🤖 AI解説・学習戦略</h2>
            {AI_TIPS.map((tip) => (
              <div key={tip.title} style={{ background: "#1e293b", border: "1px solid #334155",
                                            borderRadius: 16, padding: 16 }}>
                <p style={{ color: "#60a5fa", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  {tip.icon} {tip.title}
                </p>
                <p style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.7 }}>{tip.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── 模試 ────────────────────────────────────── */}
        {activeTab === "mock" && (
          <TOEICMockTest
            key={mockKey} words={mockWords}
            onComplete={(score, total) => {
              addRecord({ mode: "toeic", level: "模試", score, total });
              newMock();
            }}
            onNewTest={newMock}
          />
        )}

        {/* ── 弱点分析 ─────────────────────────────────── */}
        {activeTab === "weakness" && (
          <TOEICWeakness history={history} lCounts={lCounts} reviewItems={reviewItems} wrongCount={wrongCount}
            onGoToWrong={() => { handleSourceChange("wrong"); setActiveTab("words"); }} />
        )}

        {/* ── 学習履歴 ─────────────────────────────────── */}
        {activeTab === "history" && (
          <TOEICHistory history={history} />
        )}

        {/* ── 復習 ──────────────────────────────────────── */}
        {activeTab === "review" && (
          <ReviewTab items={reviewItems} vocabulary={vocabulary} phrases={phrases} onRemove={onRemove} />
        )}
      </main>

      {/* ナビゲーション */}
      <nav style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 640, background: "#0f172a",
        borderTop: "1px solid #1e293b", display: "flex", zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom,0px)",
        overflowX: "auto",
      }}>
        {tabs.map((tab) => (
          <button key={tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id !== "parts") setSelPart(null); }}
            style={{ flex: "1 0 auto", minWidth: 52, display: "flex", flexDirection: "column",
                     alignItems: "center", justifyContent: "center", gap: 2, padding: "10px 4px",
                     border: "none", background: "none", cursor: "pointer", minHeight: 56,
                     color: activeTab === tab.id ? "#22d3ee" : "#64748b",
                     fontSize: 10, fontWeight: 500, position: "relative" }}>
            <span style={{ fontSize: 19, lineHeight: 1 }}>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === "review" && reviewCount > 0 && (
              <span style={{
                position: "absolute", top: 6, right: "calc(50% - 14px)",
                background: "#f59e0b", color: "#0f172a", fontSize: 9, fontWeight: 700,
                width: 16, height: 16, borderRadius: 99,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {reviewCount > 9 ? "9+" : reviewCount}
              </span>
            )}
            {activeTab === tab.id && (
              <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
                             width: 24, height: 2, background: "#22d3ee", borderRadius: 2 }} />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// サブコンポーネント
// ──────────────────────────────────────────────────────────

function TOEICHome({ toeicVocab, lCounts, history, reviewCount, wrongCount, onNavigate }: {
  toeicVocab: Word[]; lCounts: Record<string, number>;
  history: StudyHistory; reviewCount: number; wrongCount: number; onNavigate: (t: Tab) => void;
}) {
  const levelColor: Record<string, string> = {
    "TOEIC600": "#f59e0b", "TOEIC730": "#f97316", "TOEIC860": "#ef4444",
  };
  const scoreEstimate = (avg: number | null) =>
    avg === null ? "未受験" : avg >= 0.9 ? "860+" : avg >= 0.75 ? "730+" : avg >= 0.6 ? "600+" : "〜600";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "linear-gradient(135deg,#0f766e,#0284c7)", borderRadius: 20,
                    padding: 20, color: "#fff" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>TOEIC対策モード</h2>
        <p style={{ color: "#a5f3fc", fontSize: 13 }}>TOEIC 600〜860点を目指す</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
          {[
            { v: toeicVocab.length, l: "TOEIC単語" },
            { v: history.streak,   l: "連続学習日" },
            { v: wrongCount,       l: "苦手単語" },
            { v: reviewCount,      l: "復習リスト" },
          ].map(({ v, l }) => (
            <div key={l} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12,
                                  padding: "10px 0", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 10, color: "#a5f3fc" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* レベル別 */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          📊 レベル別単語数
        </p>
        {(["TOEIC600","TOEIC730","TOEIC860"] as const).map((lv) => {
          const cnt = lCounts[lv] ?? 0;
          const pct = toeicVocab.length > 0 ? cnt / toeicVocab.length : 0;
          return (
            <div key={lv} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 76, fontSize: 11, color: "#cbd5e1" }}>{lv}</span>
              <div style={{ flex: 1, height: 6, background: "#334155", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct * 100}%`, height: "100%",
                              background: levelColor[lv], borderRadius: 3 }} />
              </div>
              <span style={{ width: 36, fontSize: 12, color: "#94a3b8", textAlign: "right" }}>{cnt}語</span>
            </div>
          );
        })}
      </div>

      {/* 学習メニュー */}
      {([
        { tab: "words"    as Tab, icon: "📚", title: "単語学習",       desc: `${toeicVocab.length} 語でフラッシュカード＋クイズ`, bg: "linear-gradient(135deg,#0f766e,#0891b2)" },
        { tab: "parts"    as Tab, icon: "📝", title: "Part 1〜7 学習", desc: "各パート戦略＋Part5 練習問題",                       bg: "linear-gradient(135deg,#4f46e5,#6d28d9)" },
        { tab: "mock"     as Tab, icon: "🏆", title: "模試",           desc: "40問・タイムアタック形式",                           bg: "linear-gradient(135deg,#d97706,#dc2626)" },
        { tab: "weakness" as Tab, icon: "📈", title: "弱点分析",       desc: "クイズ履歴からスコアを分析",                         bg: "linear-gradient(135deg,#065f46,#1e40af)" },
        { tab: "ai"       as Tab, icon: "🤖", title: "AI解説",         desc: "TOEICスコアアップの学習戦略",                        bg: "linear-gradient(135deg,#581c87,#831843)" },
      ] as const).map((f) => (
        <button key={f.tab} onClick={() => onNavigate(f.tab)}
          style={{ background: f.bg, borderRadius: 16, padding: 16,
                   display: "flex", alignItems: "center", gap: 14,
                   width: "100%", border: "none", cursor: "pointer", color: "#fff", textAlign: "left" }}>
          <span style={{ fontSize: 30 }}>{f.icon}</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15 }}>{f.title}</p>
            <p style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{f.desc}</p>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 18, opacity: 0.7 }}>›</span>
        </button>
      ))}
    </div>
  );
}

function TOEICPartsMenu({ onSelect }: { onSelect: (i: number) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Part 1〜7 学習</h2>
      {PART_INFO.map((p, i) => (
        <button key={p.part} onClick={() => onSelect(i)}
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16,
                   padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                   width: "100%", cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontSize: 28 }}>{p.icon}</span>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>
              Part {p.part}：{p.name}
            </p>
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
              {p.questions}問 {"hasPractice" in p ? "· 練習問題あり" : "· 戦略＆ヒント"}
            </p>
          </div>
          <span style={{ color: "#64748b", fontSize: 20 }}>›</span>
        </button>
      ))}
    </div>
  );
}

function TOEICPartDetail({ part, vocab, isInList, onToggle, onBack, addRecord }: {
  part: typeof PART_INFO[number];
  vocab: Word[];
  isInList: (type: ReviewItemType, id: number) => boolean;
  onToggle: (type: ReviewItemType, id: number) => void;
  onBack: () => void;
  addRecord: (r: Omit<import("../hooks/useStudyHistory").QuizRecord, "date">) => void;
}) {
  const [showPractice, setShowPractice] = useState(false);
  const [practiceWords] = useState(() => pickRandom(vocab, SESSION));
  const [practiceKey, setPracticeKey] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={onBack}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none",
                 border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, padding: 0 }}>
        ‹ Part一覧に戻る
      </button>

      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 28 }}>{part.icon}</span>
          <div>
            <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16 }}>Part {part.part}：{part.name}</p>
            <p style={{ color: "#64748b", fontSize: 12 }}>{part.questions}問</p>
          </div>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.7, marginBottom: 12 }}>{part.desc}</p>
        <div style={{ borderTop: "1px solid #334155", paddingTop: 12 }}>
          <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📌 攻略のポイント</p>
          {part.tips.map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#0ea5e9", fontSize: 12, flexShrink: 0 }}>✓</span>
              <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>{tip}</p>
            </div>
          ))}
        </div>
      </div>

      {"hasPractice" in part && part.hasPractice && (
        <div>
          <button onClick={() => setShowPractice((v) => !v)}
            style={{ width: "100%", background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
                     border: "none", borderRadius: 14, padding: "14px", color: "#fff",
                     fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 12 }}>
            {showPractice ? "▲ 練習問題を閉じる" : "▶ Part5 練習問題を解く"}
          </button>
          {showPractice && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button onClick={() => setPracticeKey((k) => k + 1)}
                  style={sBtn("#312e81","#a5b4fc","#4338ca")}>
                  🔀 新しい問題
                </button>
              </div>
              <Quiz key={practiceKey} words={practiceWords} pool={vocab} mode="toeic" part5Style
                onComplete={(score, total) => addRecord({ mode: "toeic", level: "Part5", score, total })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TOEICMockTest({ words, onComplete, onNewTest }: {
  words: Word[];
  onComplete: (score: number, total: number) => void;
  onNewTest: () => void;
}) {
  const TOTAL_TIME = 20 * 60; // 20分
  const [started,  setStarted]  = useState(false);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [quizKey,  setQuizKey]  = useState(0);
  const [score,    setScore]    = useState(0);

  const start = () => {
    setStarted(true);
    setFinished(false);
    setTimeLeft(TOTAL_TIME);
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(interval); setFinished(true); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const pct = timeLeft / TOTAL_TIME;
  const timerColor = timeLeft < 300 ? "#ef4444" : timeLeft < 600 ? "#f59e0b" : "#22d3ee";

  if (!started) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>🏆 模試（Part5スタイル）</h2>
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 20 }}>
          <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.8, marginBottom: 16 }}>
            TOEIC Part5形式（短文穴埋め）の模擬試験です。<br/>
            40問・制限時間20分。本番に近い環境で実力を測りましょう。
          </p>
          {[
            { label: "問題数",     value: "40問" },
            { label: "制限時間",   value: "20分" },
            { label: "出題範囲",   value: "TOEIC600/730/860" },
            { label: "形式",       value: "4択（日本語→英語）" },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between",
                                      padding: "8px 0", borderBottom: "1px solid #334155" }}>
              <span style={{ color: "#64748b", fontSize: 13 }}>{label}</span>
              <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
        <button onClick={start}
          style={{ background: "linear-gradient(135deg,#d97706,#dc2626)", border: "none",
                   borderRadius: 16, padding: "18px", color: "#fff",
                   fontWeight: 700, fontSize: 18, cursor: "pointer" }}>
          模試を開始する
        </button>
      </div>
    );
  }

  if (finished) {
    const pctScore = Math.round(score / words.length * 100);
    // 簡易スコア換算
    const estimated = pctScore >= 90 ? "860+" : pctScore >= 75 ? "730+" : pctScore >= 60 ? "600+" : "〜600";
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 20 }}>
        <div style={{ fontSize: 60 }}>{pctScore >= 80 ? "🎉" : pctScore >= 60 ? "👍" : "📚"}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>模試終了！</h2>
        <div style={{ background: "#1e293b", borderRadius: 20, padding: 24, textAlign: "center", width: "100%" }}>
          <p style={{ fontSize: 52, fontWeight: 800, color: "#22d3ee" }}>
            {score}<span style={{ fontSize: 24, color: "#64748b" }}>/{words.length}</span>
          </p>
          <p style={{ color: "#94a3b8" }}>正解率 {pctScore}%</p>
          <div style={{ marginTop: 16, padding: "12px 20px", background: "#0f172a",
                        borderRadius: 12, display: "inline-block" }}>
            <p style={{ color: "#a5f3fc", fontSize: 13 }}>推定スコア</p>
            <p style={{ color: "#22d3ee", fontWeight: 800, fontSize: 28 }}>{estimated}</p>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 16 }}>
            {pctScore >= 80 ? "素晴らしい成績です！" : pctScore >= 60 ? "あと一歩！弱点分析で改善しましょう。" : "基礎単語を固めてから再挑戦しましょう。"}
          </p>
        </div>
        <button onClick={() => { onComplete(score, words.length); onNewTest(); setStarted(false); setFinished(false); }}
          style={{ width: "100%", background: "#1e293b", border: "1px solid #334155",
                   borderRadius: 14, padding: "14px", color: "#e2e8f0",
                   fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
          新しい模試を始める
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* タイマー */}
      <div style={{ background: "#1e293b", borderRadius: 14, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "#94a3b8", fontSize: 13 }}>残り時間</span>
          <span style={{ color: timerColor, fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {mm}:{ss}
          </span>
        </div>
        <div style={{ height: 4, background: "#334155", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct * 100}%`, height: "100%",
                        background: timerColor, borderRadius: 2,
                        transition: "width 1s linear, background 0.5s" }} />
        </div>
      </div>
      <Quiz key={quizKey} words={words} mode="toeic" mockMode
        onComplete={(s) => { setScore(s); setFinished(true); }} />
    </div>
  );
}

function TOEICWeakness({ history, lCounts, reviewItems, wrongCount, onGoToWrong }: {
  history: StudyHistory;
  lCounts: Record<string, number>;
  reviewItems: ReviewItem[];
  wrongCount: number;
  onGoToWrong: () => void;
}) {
  const levels = ["TOEIC600", "TOEIC730", "TOEIC860", "Part5", "模試"] as const;

  const avgScore = (level: string): number | null => {
    const recs = history.records.filter((r) => r.mode === "toeic" && r.level === level && r.total > 0);
    if (recs.length === 0) return null;
    return recs.reduce((s, r) => s + r.score / r.total, 0) / recs.length;
  };

  const gradeColor = (avg: number | null) =>
    avg === null ? "#334155" : avg >= 0.8 ? "#10b981" : avg >= 0.6 ? "#f59e0b" : "#ef4444";
  const gradeLabel = (avg: number | null) =>
    avg === null ? "未受験" : avg >= 0.8 ? "得意" : avg >= 0.6 ? "普通" : "要強化";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>📈 弱点分析</h2>

      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          レベル別 正解率
        </p>
        {levels.map((lv) => {
          const avg = avgScore(lv);
          const col = gradeColor(avg);
          const pct = avg !== null ? avg * 100 : 0;
          return (
            <div key={lv} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#cbd5e1", fontSize: 13 }}>{lv}</span>
                <span style={{ color: col, fontSize: 13, fontWeight: 600 }}>
                  {avg !== null ? `${Math.round(pct)}%` : "−"} {gradeLabel(avg)}
                </span>
              </div>
              <div style={{ height: 8, background: "#334155", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 4,
                              transition: "width 0.8s ease" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 苦手単語 */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          ❌ 苦手単語
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "#cbd5e1", fontSize: 14 }}>クイズで間違えた単語数</p>
          <p style={{ color: "#f87171", fontSize: 22, fontWeight: 700 }}>{wrongCount}</p>
        </div>
        {wrongCount > 0 && (
          <button onClick={onGoToWrong}
            style={{ marginTop: 10, width: "100%", background: "rgba(239,68,68,0.1)",
                     border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10,
                     padding: "8px", color: "#f87171", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            苦手単語から出題する →
          </button>
        )}
      </div>

      {/* 復習リストから弱点推定 */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          ⭐ 復習リストの状況
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "#cbd5e1", fontSize: 14 }}>要復習単語数</p>
          <p style={{ color: "#fbbf24", fontSize: 22, fontWeight: 700 }}>
            {reviewItems.filter((i) => i.type === "word").length}
          </p>
        </div>
        {reviewItems.filter((i) => i.type === "word").length > 0 && (
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
            復習タブから集中的に練習しましょう。
          </p>
        )}
      </div>

      {history.records.filter((r) => r.mode === "toeic").length === 0 && (
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 20, textAlign: "center" }}>
          <p style={{ color: "#64748b", fontSize: 14 }}>
            単語クイズや模試を受けると<br/>弱点分析が表示されます
          </p>
        </div>
      )}
    </div>
  );
}

function TOEICHistory({ history }: { history: StudyHistory }) {
  const toeicRecords = history.records.filter((r) => r.mode === "toeic").slice(-20).reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>📅 学習履歴</h2>

      {/* サマリー */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[
          { v: history.streak,            l: "連続学習", unit: "日" },
          { v: history.totalWordsStudied, l: "累計学習", unit: "語" },
          { v: toeicRecords.length,       l: "受験回数", unit: "回" },
        ].map(({ v, l, unit }) => (
          <div key={l} style={{ background: "#1e293b", border: "1px solid #334155",
                                borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
            <p style={{ color: "#22d3ee", fontSize: 22, fontWeight: 800 }}>
              {v}<span style={{ fontSize: 12, color: "#64748b" }}>{unit}</span>
            </p>
            <p style={{ color: "#94a3b8", fontSize: 11 }}>{l}</p>
          </div>
        ))}
      </div>

      {/* 最近の記録 */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          最近のクイズ結果
        </p>
        {toeicRecords.length === 0 ? (
          <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
            まだ記録がありません
          </p>
        ) : (
          toeicRecords.map((r, i) => {
            const pct = Math.round(r.score / r.total * 100);
            const col = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10,
                                    padding: "8px 0", borderBottom: i < toeicRecords.length - 1 ? "1px solid #334155" : "none" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: "#cbd5e1", fontSize: 13 }}>{r.level}</p>
                  <p style={{ color: "#64748b", fontSize: 11 }}>{r.date}</p>
                </div>
                <p style={{ color: col, fontWeight: 700, fontSize: 15 }}>
                  {r.score}/{r.total} ({pct}%)
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function sBtn(bg: string, color: string, border: string) {
  return {
    display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
    background: bg, color, border: `1px solid ${border}`,
    borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
  } as const;
}
