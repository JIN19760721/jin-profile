"use client";
import { useState, useRef, useCallback } from "react";
import type { Word } from "../data/vocabulary";
import { useTTS, useSpeechRecognition, similarity } from "../hooks/useSpeech";

interface FlashCardProps {
  word: Word;
  onNext: () => void;
  onPrev: () => void;
  current: number;
  total: number;
  isReviewed: boolean;
  onToggleReview: () => void;
}

const levelColors: Record<string, string> = {
  "中学":    "bg-emerald-500/20 text-emerald-300",
  "高校":    "bg-sky-500/20 text-sky-300",
  "TOEIC600":"bg-amber-500/20 text-amber-300",
  "TOEIC730":"bg-orange-500/20 text-orange-300",
  "TOEIC860":"bg-rose-500/20 text-rose-300",
};

export default function FlashCard({
  word, onNext, onPrev, current, total, isReviewed, onToggleReview,
}: FlashCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [score, setScore]     = useState<number | null>(null);

  // スワイプ検出: タップと区別するため startX を保持
  const touchStartX = useRef<number | null>(null);
  const isSwiping   = useRef(false);

  const { speak, speaking }                                      = useTTS();
  const { startListening, reset: resetRec, state: recState, transcript, errorMsg } =
    useSpeechRecognition();

  const goNext = () => { setFlipped(false); setScore(null); resetRec(); setTimeout(onNext, 120); };
  const goPrev = () => { setFlipped(false); setScore(null); resetRec(); setTimeout(onPrev, 120); };

  const handleRecord = useCallback(() => {
    if (recState === "listening") return;
    setScore(null);
    startListening((text) => setScore(similarity(word.english, text)));
  }, [recState, startListening, word.english]);

  /* ---- touch handlers (swipe only, don't block clicks) ---- */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isSwiping.current   = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    if (Math.abs(e.touches[0].clientX - touchStartX.current) > 10) {
      isSwiping.current = true;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (isSwiping.current && Math.abs(dx) > 60) {
      dx < 0 ? goNext() : goPrev();
    }
    touchStartX.current = null;
    isSwiping.current   = false;
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Meta */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>{current} / {total}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelColors[word.level] ?? "bg-slate-500/20 text-slate-300"}`}>
          {word.level}
        </span>
        <span className="text-slate-500 text-xs">{word.category}</span>
      </div>

      {/* Card — tap flips, swipe navigates */}
      <div
        style={{ perspective: "1200px" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (!isSwiping.current) setFlipped((f) => !f); }}
      >
        <div
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.45s",
            minHeight: 200,
            position: "relative",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex flex-col items-center justify-center p-6 shadow-xl"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-4xl font-bold text-white text-center mb-2">{word.english}</p>
            <p className="text-base text-indigo-200">{word.katakana}</p>
            <p className="mt-5 text-xs text-indigo-300/70">タップで意味を見る</p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex flex-col items-center justify-center p-6 shadow-xl"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-3xl font-bold text-white mb-2">{word.japanese}</p>
            <p className="text-sm text-slate-300 italic text-center mt-2">"{word.example}"</p>
            <p className="text-xs text-slate-400 mt-1 text-center">{word.exampleJp}</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => speak(word.english)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-medium ${
            speaking ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-300"
          }`}
        >
          <span>{speaking ? "🔊" : "🔈"}</span>
          <span>{speaking ? "再生中" : "読み上げ"}</span>
        </button>

        <button
          onClick={handleRecord}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-medium ${
            recState === "listening" ? "bg-rose-600 text-white" : "bg-slate-700 text-slate-300"
          }`}
        >
          <span>🎤</span>
          <span>{recState === "listening" ? "録音中…" : "発音練習"}</span>
        </button>

        <button
          onClick={onToggleReview}
          className={`px-4 py-3 rounded-xl text-xl ${
            isReviewed ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-400"
          }`}
        >
          {isReviewed ? "⭐" : "☆"}
        </button>
      </div>

      {/* Recognition result */}
      {(recState === "done" || recState === "error") && (
        <div className={`rounded-xl p-4 text-sm ${
          recState === "error"
            ? "bg-slate-700 text-slate-400"
            : score !== null && score >= 0.8
            ? "bg-emerald-500/10 border border-emerald-500/30"
            : "bg-amber-500/10 border border-amber-500/30"
        }`}>
          {recState === "error" ? errorMsg : (
            <>
              <p className="text-slate-400 text-xs mb-1">あなたの発音</p>
              <p className="text-white font-medium">"{transcript}"</p>
              {score !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-600">
                    <div
                      className={`h-1.5 rounded-full ${score >= 0.8 ? "bg-emerald-400" : score >= 0.5 ? "bg-amber-400" : "bg-rose-400"}`}
                      style={{ width: `${Math.round(score * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold ${score >= 0.8 ? "text-emerald-400" : score >= 0.5 ? "text-amber-400" : "text-rose-400"}`}>
                    {score >= 0.8 ? "Great! 🎉" : score >= 0.5 ? "Good 👍" : "再挑戦 💪"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button onClick={goPrev} className="flex-1 py-4 rounded-xl bg-slate-700 text-white font-medium">
          ← 前へ
        </button>
        <button onClick={goNext} className="flex-1 py-4 rounded-xl bg-indigo-600 text-white font-medium">
          次へ →
        </button>
      </div>
    </div>
  );
}
