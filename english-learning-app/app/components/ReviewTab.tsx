"use client";
import { useState } from "react";
import type { ReviewItem, ReviewItemType } from "../hooks/useReviewList";
import type { Word, Phrase } from "../data/vocabulary";
import { useTTS, useSpeechRecognition, similarity } from "../hooks/useSpeech";

interface ReviewTabProps {
  items: ReviewItem[];
  vocabulary: Word[];
  phrases: Phrase[];
  onRemove: (type: ReviewItemType, id: number) => void;
}

interface ReviewRowProps {
  text: string;
  japanese: string;
  sub?: string;
  onRemove: () => void;
}

function ReviewRow({ text, japanese, sub, onRemove }: ReviewRowProps) {
  const [score, setScore] = useState<number | null>(null);
  const { speak, speaking } = useTTS();
  const { startListening, reset: resetRec, state: recState, transcript, errorMsg } = useSpeechRecognition();

  const handleRecord = () => {
    setScore(null);
    startListening((t) => setScore(similarity(text, t)));
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate">{text}</p>
          <p className="text-slate-400 text-sm">{japanese}</p>
          {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 text-slate-500 active:text-rose-400 text-lg px-1 transition-colors"
          aria-label="復習リストから削除"
        >
          ★
        </button>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => speak(text)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
            speaking ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-300 active:bg-slate-600"
          }`}
        >
          <span>{speaking ? "🔊" : "🔈"}</span>
          <span>{speaking ? "再生中" : "読み上げ"}</span>
        </button>

        <button
          onClick={recState === "listening" ? resetRec : handleRecord}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
            recState === "listening"
              ? "bg-rose-600 text-white animate-pulse"
              : "bg-slate-700 text-slate-300 active:bg-slate-600"
          }`}
        >
          <span>🎤</span>
          <span>{recState === "listening" ? "録音中…" : "発音練習"}</span>
        </button>
      </div>

      {(recState === "done" || recState === "error") && (
        <div className={`mt-2 rounded-lg p-2.5 text-xs ${
          recState === "error"
            ? "bg-slate-700/50 text-slate-400"
            : score !== null && score >= 0.7
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : "bg-amber-500/10 border border-amber-500/20"
        }`}>
          {recState === "error" ? errorMsg : (
            <>
              <span className="text-slate-400">認識: </span>
              <span className="text-white">"{transcript}"</span>
              {score !== null && (
                <span className={`ml-2 font-semibold ${
                  score >= 0.7 ? "text-emerald-400" : "text-amber-400"
                }`}>
                  {score >= 0.7 ? "Great! 🎉" : "もう一度 💪"}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReviewTab({ items, vocabulary, phrases, onRemove }: ReviewTabProps) {
  const wordItems = items.filter((i) => i.type === "word");
  const phraseItems = items.filter((i) => i.type === "phrase");

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <span className="text-6xl">☆</span>
        <h3 className="text-lg font-semibold text-white">復習リストは空です</h3>
        <p className="text-slate-400 text-sm max-w-xs">
          フラッシュカードやフレーズの ☆ をタップすると、ここに追加されます。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">復習リスト</h2>
        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded-full">
          {items.length} 件
        </span>
      </div>

      {wordItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            単語 ({wordItems.length})
          </h3>
          {wordItems.map((item) => {
            const word = vocabulary.find((w) => w.id === item.id);
            if (!word) return null;
            return (
              <ReviewRow
                key={`word-${word.id}`}
                text={word.english}
                japanese={word.japanese}
                sub={`${word.katakana} · ${word.category}`}
                onRemove={() => onRemove("word", word.id)}
              />
            );
          })}
        </section>
      )}

      {phraseItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            フレーズ ({phraseItems.length})
          </h3>
          {phraseItems.map((item) => {
            const phrase = phrases.find((p) => p.id === item.id);
            if (!phrase) return null;
            return (
              <ReviewRow
                key={`phrase-${phrase.id}`}
                text={phrase.english}
                japanese={phrase.japanese}
                sub={phrase.situation}
                onRemove={() => onRemove("phrase", phrase.id)}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
