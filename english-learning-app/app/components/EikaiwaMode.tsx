"use client";
import { useState } from "react";
import FlashCard  from "./FlashCard";
import PhraseCard from "./PhraseCard";
import Quiz       from "./Quiz";
import ReviewTab  from "./ReviewTab";
import type { Word, Phrase }    from "../data/vocabulary";
import type { ReviewItem, ReviewItemType } from "../hooks/useReviewList";
import type { StudyHistory }   from "../hooks/useStudyHistory";

type Tab = "home" | "flashcard" | "phrases" | "quiz" | "review";

const LEVELS_EW = ["中学", "高校"] as const;
type LevelEW = typeof LEVELS_EW[number];
const SESSION = 20;

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

interface Props {
  vocabulary:  Word[];
  phrases:     Phrase[];
  reviewItems: ReviewItem[];
  onToggle:    (type: ReviewItemType, id: number) => void;
  onRemove:    (type: ReviewItemType, id: number) => void;
  isInList:    (type: ReviewItemType, id: number) => boolean;
  history:     StudyHistory;
  onBack:      () => void;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "home",      label: "ホーム",   icon: "🏠" },
  { id: "flashcard", label: "単語",     icon: "📖" },
  { id: "phrases",   label: "フレーズ", icon: "💬" },
  { id: "quiz",      label: "クイズ",   icon: "🎯" },
  { id: "review",    label: "復習",     icon: "⭐" },
];

export default function EikaiwaMode({
  vocabulary, phrases, reviewItems, onToggle, onRemove, isInList, history, onBack,
}: Props) {
  // 中学・高校のみ
  const ewVocab   = vocabulary.filter((w) => w.level === "中学" || w.level === "高校");
  const ewPhrases = phrases; // フレーズはすべて英会話用

  const [activeTab,  setActiveTab]  = useState<Tab>("home");
  const [filter,     setFilter]     = useState<LevelEW | "全て">("全て");
  const [cardIndex,  setCardIndex]  = useState(0);
  const [flashWords, setFlashWords] = useState<Word[]>(()   => pickRandom(ewVocab, SESSION));
  const [quizWords,  setQuizWords]  = useState<Word[]>(()   => pickRandom(ewVocab, SESSION));
  const [quizKey,    setQuizKey]    = useState(0);
  const [phraseList, setPhraseList] = useState<Phrase[]>(() => pickRandom(ewPhrases, SESSION));

  const reviewCount = reviewItems.length;
  const safeIndex   = flashWords.length > 0 ? cardIndex % flashWords.length : 0;

  const levelPool = (lv: LevelEW | "全て") =>
    lv === "全て" ? ewVocab : ewVocab.filter((w) => w.level === lv);

  const handleFilter = (lv: LevelEW | "全て") => {
    setFilter(lv);
    setCardIndex(0);
    setFlashWords(pickRandom(levelPool(lv), SESSION));
  };
  const shuffleFlash  = () => { setCardIndex(0); setFlashWords(pickRandom(levelPool(filter), SESSION)); };
  const shuffleQuiz   = () => { setQuizWords(pickRandom(ewVocab, SESSION)); setQuizKey((k) => k + 1); };
  const shufflePhrase = () => setPhraseList(pickRandom(ewPhrases, SESSION));

  const levelCounts = {
    "中学": ewVocab.filter((w) => w.level === "中学").length,
    "高校": ewVocab.filter((w) => w.level === "高校").length,
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", position: "relative" }}>
      {/* ヘッダー */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#0f172a", borderBottom: "1px solid #1e293b",
        padding: "12px 16px", paddingTop: "max(12px,env(safe-area-inset-top))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack}
            style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px",
                     color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>
            ‹
          </button>
          <h1 style={{ fontSize: 17, fontWeight: 700 }}>🗣️ 英会話モード</h1>
        </div>
        {reviewCount > 0 && (
          <button onClick={() => setActiveTab("review")}
            style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "none",
                     borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⭐ {reviewCount}
          </button>
        )}
      </header>

      <main style={{ padding: "20px 16px 100px" }}>

        {/* ── ホーム ─────────────────────────────── */}
        {activeTab === "home" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
              background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
              borderRadius: 20, padding: 20, color: "#fff",
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>英会話モード</h2>
              <p style={{ color: "#c7d2fe", fontSize: 13 }}>中学・高校レベルで日常英会話をマスター</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
                {[
                  { v: ewVocab.length,   l: "単語" },
                  { v: ewPhrases.length, l: "フレーズ" },
                  { v: reviewCount,      l: "復習" },
                ].map(({ v, l }) => (
                  <div key={l} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12,
                                        padding: "10px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div>
                    <div style={{ fontSize: 10, color: "#c7d2fe" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 学習ストリーク */}
            {history.streak > 0 && (
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16,
                            padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 28 }}>🔥</span>
                <div>
                  <p style={{ color: "#fbbf24", fontWeight: 700, fontSize: 16 }}>
                    {history.streak} 日連続学習中！
                  </p>
                  <p style={{ color: "#64748b", fontSize: 12 }}>
                    累計 {history.totalWordsStudied} 語学習済み
                  </p>
                </div>
              </div>
            )}

            {/* レベル別 */}
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
              <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                📊 レベル別単語数
              </p>
              {(["中学", "高校"] as const).map((lv) => {
                const cnt = levelCounts[lv];
                const pct = ewVocab.length > 0 ? cnt / ewVocab.length : 0;
                const col = lv === "中学" ? "#10b981" : "#3b82f6";
                return (
                  <div key={lv} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 48, fontSize: 12, color: "#cbd5e1" }}>{lv}</span>
                    <div style={{ flex: 1, height: 6, background: "#334155", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct * 100}%`, height: "100%", background: col, borderRadius: 3 }} />
                    </div>
                    <span style={{ width: 40, fontSize: 12, color: "#94a3b8", textAlign: "right" }}>{cnt}語</span>
                  </div>
                );
              })}
            </div>

            {/* メニュー */}
            {[
              { tab: "flashcard" as Tab, icon: "📖", title: "フラッシュカード",
                desc: `中学・高校 ${ewVocab.length} 語からランダム ${SESSION} 語`,
                bg: "linear-gradient(135deg,#4f46e5,#7c3aed)" },
              { tab: "phrases" as Tab, icon: "💬", title: "フレーズ集",
                desc: `中学・高校で学習するフレーズのうち ${Math.min(SESSION, ewPhrases.length)} 件`,
                bg: "linear-gradient(135deg,#059669,#0d9488)" },
              { tab: "quiz" as Tab, icon: "🎯", title: "単語クイズ",
                desc: `中学・高校 ${ewVocab.length} 語からランダム ${SESSION} 問`,
                bg: "linear-gradient(135deg,#d97706,#ea580c)" },
            ].map((f) => (
              <button key={f.tab} onClick={() => setActiveTab(f.tab)}
                style={{ background: f.bg, borderRadius: 16, padding: 16,
                         display: "flex", alignItems: "center", gap: 16,
                         width: "100%", border: "none", cursor: "pointer", color: "#fff", textAlign: "left" }}>
                <span style={{ fontSize: 32 }}>{f.icon}</span>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 16 }}>{f.title}</p>
                  <p style={{ fontSize: 13, opacity: 0.85 }}>{f.desc}</p>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 20, opacity: 0.7 }}>›</span>
              </button>
            ))}
          </div>
        )}

        {/* ── フラッシュカード ──────────────────────── */}
        {activeTab === "flashcard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>フラッシュカード</h2>
              <button onClick={shuffleFlash} style={shuffleBtn("#312e81","#a5b4fc","#4338ca")}>
                🔀 シャッフル
              </button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["全て", "中学", "高校"] as const).map((lv) => {
                const cnt = lv === "全て" ? ewVocab.length : levelCounts[lv];
                return (
                  <button key={lv} onClick={() => handleFilter(lv)}
                    style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                             border: "none", cursor: "pointer",
                             background: filter === lv ? "#4f46e5" : "#1e293b",
                             color:      filter === lv ? "#fff"    : "#94a3b8" }}>
                    {lv} ({cnt})
                  </button>
                );
              })}
            </div>
            <p style={{ color: "#64748b", fontSize: 12 }}>
              {filter === "全て" ? ewVocab.length : levelCounts[filter as LevelEW]} 語からランダム {Math.min(SESSION, flashWords.length)} 語
            </p>
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
          </div>
        )}

        {/* ── フレーズ集 ────────────────────────────── */}
        {activeTab === "phrases" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>フレーズ集</h2>
                <p style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                  中学・高校で学習するフレーズのうち {phraseList.length} 件
                </p>
              </div>
              <button onClick={shufflePhrase} style={shuffleBtn("#064e3b","#6ee7b7","#065f46")}>
                🔀 シャッフル
              </button>
            </div>
            {phraseList.map((p) => (
              <PhraseCard key={p.id} phrase={p}
                isReviewed={isInList("phrase", p.id)}
                onToggleReview={() => onToggle("phrase", p.id)} />
            ))}
          </div>
        )}

        {/* ── クイズ ──────────────────────────────── */}
        {activeTab === "quiz" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>単語クイズ</h2>
                <p style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                  中学・高校 {ewVocab.length} 語からランダム {quizWords.length} 問
                </p>
              </div>
              <button onClick={shuffleQuiz} style={shuffleBtn("#431407","#fdba74","#7c2d12")}>
                🔀 新しい問題
              </button>
            </div>
            <Quiz key={quizKey} words={quizWords} mode="eikaiwa" />
          </div>
        )}

        {/* ── 復習 ──────────────────────────────────── */}
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
      }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                     justifyContent: "center", gap: 2, padding: "10px 0",
                     border: "none", background: "none", cursor: "pointer", minHeight: 56,
                     color: activeTab === tab.id ? "#818cf8" : "#64748b",
                     fontSize: 11, fontWeight: 500, position: "relative" }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === "review" && reviewCount > 0 && (
              <span style={{
                position: "absolute", top: 6, right: "calc(50% - 18px)",
                background: "#f59e0b", color: "#0f172a", fontSize: 9, fontWeight: 700,
                width: 16, height: 16, borderRadius: 99,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {reviewCount > 9 ? "9+" : reviewCount}
              </span>
            )}
            {activeTab === tab.id && (
              <span style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
                             width: 24, height: 2, background: "#818cf8", borderRadius: 2 }} />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

function shuffleBtn(bg: string, color: string, border: string) {
  return {
    display: "flex", alignItems: "center", gap: 5, padding: "6px 14px",
    background: bg, color, border: `1px solid ${border}`,
    borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
  } as const;
}
