"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import type { Word }              from "../data/vocabulary";
import type { ReviewItemType }    from "../hooks/useReviewList";
import { useTTS }                 from "../hooks/useSpeech";

const RECENT_KEY = "dict_recent_v1";
const MAX_RECENT = 8;
const MAX_RESULTS = 40;

const LEVEL_COLOR: Record<string, string> = {
  "中学":    "#10b981",
  "高校":    "#3b82f6",
  "TOEIC600":"#f59e0b",
  "TOEIC730":"#f97316",
  "TOEIC860":"#ef4444",
};

interface Props {
  vocabulary: Word[];
  isInList:   (type: ReviewItemType, id: number) => boolean;
  onToggle:   (type: ReviewItemType, id: number) => void;
  onBack:     () => void;
}

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(terms: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(terms.slice(0, MAX_RECENT))); } catch {}
}

export default function DictionaryMode({ vocabulary, isInList, onToggle, onBack }: Props) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState<Word | null>(null);
  const [recent,   setRecent]   = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRecent(loadRecent()); }, []);
  // スマホではフォーカス時に自動ズームが起きるため、PCのみ自動フォーカス
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const exact     = vocabulary.filter((w) => w.english.toLowerCase() === q);
    const startEn   = vocabulary.filter((w) => w.english.toLowerCase().startsWith(q) && w.english.toLowerCase() !== q);
    const includeEn = vocabulary.filter((w) => w.english.toLowerCase().includes(q) && !w.english.toLowerCase().startsWith(q));
    const includeJp = vocabulary.filter((w) =>
      (w.japanese.includes(q) || w.katakana.includes(q)) && !w.english.toLowerCase().includes(q)
    );
    return [...exact, ...startEn, ...includeEn, ...includeJp].slice(0, MAX_RESULTS);
  }, [query, vocabulary]);

  const handleSearch = (term: string) => {
    setQuery(term);
    setSelected(null);
    if (term.trim()) {
      const next = [term, ...recent.filter((r) => r !== term)].slice(0, MAX_RECENT);
      setRecent(next);
      saveRecent(next);
    }
  };

  const clearRecent = () => { setRecent([]); saveRecent([]); };

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", position: "relative" }}>
      {/* ヘッダー */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#0f172a", borderBottom: "1px solid #1e293b",
        padding: "12px 16px", paddingTop: "max(12px,env(safe-area-inset-top))",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button onClick={onBack}
          style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px",
                   color: "#94a3b8", cursor: "pointer", fontSize: 16, flexShrink: 0, lineHeight: 1 }}>
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="英単語・日本語で検索..."
            style={{
              width: "100%", padding: "10px 36px 10px 14px",
              background: "#1e293b", border: "1px solid #334155",
              borderRadius: 12, color: "#e2e8f0", fontSize: 16,
              outline: "none", boxSizing: "border-box",
            }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setSelected(null); inputRef.current?.focus(); }}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                       background: "none", border: "none", color: "#64748b", cursor: "pointer",
                       fontSize: 18, lineHeight: 1, padding: 0 }}>
              ×
            </button>
          )}
        </div>
      </header>

      <main style={{ padding: "16px 16px 80px" }}>

        {/* 単語詳細パネル */}
        {selected && (
          <WordDetail
            word={selected}
            isInList={isInList}
            onToggle={onToggle}
            onClose={() => setSelected(null)}
          />
        )}

        {/* 検索結果 */}
        {!selected && query.trim() && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>
              {results.length} 件{results.length === MAX_RESULTS ? "（上位のみ表示）" : ""}
            </p>
            {results.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                <p style={{ fontSize: 32, marginBottom: 8 }}>🔍</p>
                <p style={{ fontSize: 14 }}>「{query}」は見つかりませんでした</p>
                <p style={{ fontSize: 12, marginTop: 6, color: "#475569" }}>
                  別の英単語・日本語で検索してみてください
                </p>
              </div>
            ) : (
              results.map((w) => (
                <ResultRow key={w.id} word={w} onSelect={() => setSelected(w)} query={query} />
              ))
            )}
          </div>
        )}

        {/* 初期状態：最近の検索 */}
        {!selected && !query.trim() && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "#1e293b", border: "1px solid #334155",
                          borderRadius: 16, padding: 20, textAlign: "center" }}>
              <p style={{ fontSize: 40, marginBottom: 10 }}>📖</p>
              <p style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                辞書モード
              </p>
              <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
                11,978語をすばやく検索<br />
                英語・日本語・カタカナで検索できます
              </p>
            </div>

            {recent.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>🕐 最近の検索</p>
                  <button onClick={clearRecent}
                    style={{ color: "#64748b", fontSize: 12, background: "none",
                             border: "none", cursor: "pointer" }}>
                    クリア
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {recent.map((term) => (
                    <button key={term} onClick={() => handleSearch(term)}
                      style={{ background: "#1e293b", border: "1px solid #334155",
                               borderRadius: 20, padding: "6px 14px",
                               color: "#cbd5e1", fontSize: 13, cursor: "pointer" }}>
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* レベル別クイックアクセス */}
            <div>
              <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                📊 レベル別に調べる
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                {(["中学","高校","TOEIC600","TOEIC730","TOEIC860"] as const).map((lv) => {
                  const cnt = vocabulary.filter((w) => w.level === lv).length;
                  return (
                    <button key={lv} onClick={() => handleSearch(lv)}
                      style={{ background: "#1e293b", border: `1px solid ${LEVEL_COLOR[lv]}33`,
                               borderRadius: 12, padding: "12px",
                               display: "flex", alignItems: "center", gap: 8,
                               cursor: "pointer", textAlign: "left" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%",
                                     background: LEVEL_COLOR[lv], flexShrink: 0 }} />
                      <div>
                        <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{lv}</p>
                        <p style={{ color: "#64748b", fontSize: 11 }}>{cnt}語</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── 検索結果の1行 ─────────────────────────────────────────

function ResultRow({ word, onSelect, query }: { word: Word; onSelect: () => void; query: string }) {
  const hl = (text: string, q: string) => {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return <span>{text}</span>;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: "rgba(99,102,241,0.3)", color: "#818cf8", borderRadius: 2 }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <button onClick={onSelect}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
               background: "#1e293b", border: "1px solid #334155", borderRadius: 12,
               cursor: "pointer", textAlign: "left", width: "100%" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>
            {hl(word.english, query)}
          </span>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{word.katakana}</span>
        </div>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 1, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hl(word.japanese, query)}
        </p>
      </div>
      <span style={{ background: `${LEVEL_COLOR[word.level]}22`, color: LEVEL_COLOR[word.level],
                     fontSize: 10, fontWeight: 700, padding: "3px 7px",
                     borderRadius: 99, flexShrink: 0 }}>
        {word.level}
      </span>
      <span style={{ color: "#475569", fontSize: 16, flexShrink: 0 }}>›</span>
    </button>
  );
}

// ── 単語詳細パネル ──────────────────────────────────────────

function WordDetail({ word, isInList, onToggle, onClose }: {
  word:      Word;
  isInList:  (type: ReviewItemType, id: number) => boolean;
  onToggle:  (type: ReviewItemType, id: number) => void;
  onClose:   () => void;
}) {
  const { speak, speaking } = useTTS();
  const inReview = isInList("word", word.id);

  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={onClose}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none",
                 border: "none", color: "#64748b", cursor: "pointer", fontSize: 13,
                 marginBottom: 12, padding: 0 }}>
        ‹ 検索結果に戻る
      </button>

      <div style={{ background: "linear-gradient(135deg,#1e293b,#0f172a)",
                    border: "1px solid #334155", borderRadius: 20, overflow: "hidden" }}>
        {/* メイン情報 */}
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div>
              <h2 style={{ fontSize: 32, fontWeight: 800, color: "#e2e8f0", lineHeight: 1.1 }}>
                {word.english}
              </h2>
              <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>{word.katakana}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => speak(word.english)}
                style={{ background: speaking ? "#4f46e5" : "#1e293b",
                         border: "1px solid #334155", borderRadius: 10,
                         padding: "8px 12px", color: "#e2e8f0",
                         cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
                {speaking ? "🔊" : "🔈"}
              </button>
              <button onClick={() => onToggle("word", word.id)}
                style={{ background: inReview ? "rgba(245,158,11,0.15)" : "#1e293b",
                         border: `1px solid ${inReview ? "#f59e0b" : "#334155"}`,
                         borderRadius: 10, padding: "8px 12px",
                         color: inReview ? "#fbbf24" : "#64748b",
                         cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
                {inReview ? "⭐" : "☆"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ background: `${LEVEL_COLOR[word.level]}22`, color: LEVEL_COLOR[word.level],
                           fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99 }}>
              {word.level}
            </span>
            {word.category && (
              <span style={{ background: "#334155", color: "#94a3b8",
                             fontSize: 11, padding: "4px 10px", borderRadius: 99 }}>
                {word.category}
              </span>
            )}
          </div>
        </div>

        {/* 日本語訳 */}
        <div style={{ background: "#0f172a", padding: "16px 20px",
                      borderTop: "1px solid #1e293b" }}>
          <p style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            日本語訳
          </p>
          <p style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 700 }}>
            {word.japanese}
          </p>
        </div>

        {/* 例文 */}
        {word.example && (
          <div style={{ padding: "14px 20px", borderTop: "1px solid #1e293b" }}>
            <p style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
              例文
            </p>
            <p style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.7, fontStyle: "italic" }}>
              "{word.example}"
            </p>
            {word.exampleJp && (
              <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                {word.exampleJp}
              </p>
            )}
            <button onClick={() => speak(word.example)}
              style={{ marginTop: 8, background: "#1e293b", border: "1px solid #334155",
                       borderRadius: 8, padding: "6px 12px",
                       color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>
              🔈 例文を読み上げ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
