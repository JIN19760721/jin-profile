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
type QuizSource = "all" | "wrong";

const LEVELS_EW = ["中学", "高校"] as const;
type LevelEW = typeof LEVELS_EW[number];
const SESSION = 20;

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

interface Props {
  vocabulary:    Word[];
  phrases:       Phrase[];
  reviewItems:   ReviewItem[];
  onToggle:      (type: ReviewItemType, id: number) => void;
  onRemove:      (type: ReviewItemType, id: number) => void;
  isInList:      (type: ReviewItemType, id: number) => boolean;
  history:       StudyHistory;
  wrongIds:       Set<number>;
  onWrong:        (id: number) => void;
  onRemoveWrong:  (id: number) => void;
  onClearWrong:   () => void;
  onWordsStudied: () => void;
  onBack:         () => void;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "home",      label: "ホーム",   icon: "🏠" },
  { id: "flashcard", label: "単語",     icon: "📖" },
  { id: "phrases",   label: "フレーズ", icon: "💬" },
  { id: "quiz",      label: "クイズ",   icon: "🎯" },
  { id: "review",    label: "復習",     icon: "⭐" },
];

export default function EikaiwaMode({
  vocabulary, phrases, reviewItems, onToggle, onRemove, isInList, history,
  wrongIds, onWrong, onRemoveWrong, onClearWrong, onWordsStudied, onBack,
}: Props) {
  const ewVocab   = vocabulary.filter((w) => w.level === "中学" || w.level === "高校");
  const ewPhrases = phrases;

  const [activeTab,   setActiveTab]   = useState<Tab>("home");
  const [filter,      setFilter]      = useState<LevelEW | "全て">("全て");
  const [cardIndex,   setCardIndex]   = useState(0);
  const [flashWords,  setFlashWords]  = useState<Word[]>(() => pickRandom(ewVocab, SESSION));
  const [quizWords,   setQuizWords]   = useState<Word[]>(() => pickRandom(ewVocab, SESSION));
  const [quizKey,     setQuizKey]     = useState(0);
  const [phraseList,  setPhraseList]  = useState<Phrase[]>(() => pickRandom(ewPhrases, SESSION));
  const [quizSource,  setQuizSource]  = useState<QuizSource>("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const reviewCount = reviewItems.length;
  const wrongCount  = wrongIds.size;
  const safeIndex   = flashWords.length > 0 ? cardIndex % flashWords.length : 0;

  const wrongWords  = ewVocab.filter((w) => wrongIds.has(w.id));

  const levelPool = (lv: LevelEW | "全て") =>
    lv === "全て" ? ewVocab : ewVocab.filter((w) => w.level === lv);

  const handleFilter = (lv: LevelEW | "全て") => {
    setFilter(lv);
    setCardIndex(0);
    setFlashWords(pickRandom(levelPool(lv), SESSION));
  };
  const shuffleFlash  = () => { setCardIndex(0); setFlashWords(pickRandom(levelPool(filter), SESSION)); };
  const shuffleQuiz   = () => {
    const pool = quizSource === "wrong" ? wrongWords : ewVocab;
    setQuizWords(pickRandom(pool, Math.min(SESSION, pool.length)));
    setQuizKey((k) => k + 1);
  };
  const shufflePhrase = () => setPhraseList(pickRandom(ewPhrases, SESSION));

  const handleSourceChange = (src: QuizSource) => {
    setQuizSource(src);
    const pool = src === "wrong" ? wrongWords : ewVocab;
    if (pool.length > 0) {
      setQuizWords(pickRandom(pool, Math.min(SESSION, pool.length)));
      setQuizKey((k) => k + 1);
    }
  };

  const levelCounts = {
    "中学": ewVocab.filter((w) => w.level === "中学").length,
    "高校": ewVocab.filter((w) => w.level === "高校").length,
  };

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", position: "relative" }}>
      {/* ヘッダー */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#0f172a", borderBottom: "1px solid #1e293b",
        padding: "12px 16px", paddingTop: "max(12px,env(safe-area-inset-top))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button onClick={onBack}
            style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px",
                     color: "#94a3b8", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>
            ‹
          </button>
          <h1 style={{ fontSize: 17, fontWeight: 700, whiteSpace: "nowrap" }}>🗣️ 英会話モード</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {wrongCount > 0 && (
            <button onClick={() => { handleSourceChange("wrong"); setActiveTab("quiz"); }}
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "none",
                       borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              ❌ {wrongCount}
            </button>
          )}
          {reviewCount > 0 && (
            <button onClick={() => setActiveTab("review")}
              style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "none",
                       borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              ⭐ {reviewCount}
            </button>
          )}
        </div>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
                {[
                  { v: ewVocab.length,   l: "単語" },
                  { v: ewPhrases.length, l: "フレーズ" },
                  { v: wrongCount,       l: "苦手" },
                  { v: reviewCount,      l: "復習" },
                ].map(({ v, l }) => (
                  <div key={l} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12,
                                        padding: "10px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
                    <div style={{ fontSize: 10, color: "#c7d2fe" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 苦手単語バナー */}
            {wrongCount > 0 && (
              <button onClick={() => { handleSourceChange("wrong"); setActiveTab("quiz"); }}
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                         borderRadius: 16, padding: "14px 16px", cursor: "pointer",
                         display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left" }}>
                <span style={{ fontSize: 28 }}>❌</span>
                <div style={{ flex: 1 }}>
                  <p style={{ color: "#f87171", fontWeight: 700, fontSize: 15 }}>
                    苦手単語 {wrongCount}語
                  </p>
                  <p style={{ color: "#64748b", fontSize: 12 }}>
                    クイズで間違えた単語です。タップして復習する
                  </p>
                </div>
                <span style={{ color: "#f87171", fontSize: 18 }}>›</span>
              </button>
            )}

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
                  {quizSource === "wrong"
                    ? `苦手単語 ${wrongWords.length} 語から ${quizWords.length} 問`
                    : `中学・高校 ${ewVocab.length} 語からランダム ${quizWords.length} 問`}
                </p>
              </div>
              <button onClick={shuffleQuiz} style={shuffleBtn("#431407","#fdba74","#7c2d12")}>
                🔀 新しい問題
              </button>
            </div>

            {/* 出題ソース切替 */}
            <div style={{ display: "flex", gap: 6, background: "#1e293b",
                          borderRadius: 12, padding: 4 }}>
              {(["all", "wrong"] as QuizSource[]).map((src) => {
                const label  = src === "all" ? "全単語から出題" : `苦手単語から出題 (${wrongCount})`;
                const active = quizSource === src;
                return (
                  <button key={src} onClick={() => handleSourceChange(src)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none",
                             cursor: "pointer", fontSize: 12, fontWeight: 600,
                             background: active ? (src === "wrong" ? "#991b1b" : "#4f46e5") : "transparent",
                             color:      active ? "#fff" : "#64748b" }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* 苦手出題で単語がない場合 */}
            {quizSource === "wrong" && wrongWords.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px",
                            background: "#1e293b", borderRadius: 16, border: "1px solid #334155" }}>
                <p style={{ fontSize: 36, marginBottom: 10 }}>🎉</p>
                <p style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                  苦手単語がありません！
                </p>
                <p style={{ color: "#64748b", fontSize: 13 }}>
                  クイズで間違えた単語がここに表示されます
                </p>
              </div>
            ) : (
              <Quiz key={quizKey} words={quizWords} pool={ewVocab} mode="eikaiwa" onWrong={onWrong} onCorrect={onWordsStudied} />
            )}

            {/* 苦手単語リスト */}
            {quizSource === "wrong" && wrongWords.length > 0 && (
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
                    苦手単語リスト ({wrongWords.length}語)
                  </p>
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
                                           padding: "6px 0", borderBottom: "1px solid #334155" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{w.english}</span>
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
                  <p style={{ color: "#475569", fontSize: 12, marginTop: 8, textAlign: "center" }}>
                    他 {wrongWords.length - 10} 語
                  </p>
                )}
              </div>
            )}
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
            {tab.id === "quiz" && wrongCount > 0 && (
              <span style={{
                position: "absolute", top: 6, right: "calc(50% - 18px)",
                background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
                width: 16, height: 16, borderRadius: 99,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {wrongCount > 9 ? "9+" : wrongCount}
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
