"use client";
import { useState } from "react";
import type { Phrase } from "../data/vocabulary";
import { useTTS, useSpeechRecognition, similarity } from "../hooks/useSpeech";

interface PhraseCardProps {
  phrase: Phrase;
  isReviewed: boolean;
  onToggleReview: () => void;
}

export default function PhraseCard({ phrase, isReviewed, onToggleReview }: PhraseCardProps) {
  const [copied, setCopied] = useState(false);
  const [showMic, setShowMic] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  const { speak, speaking } = useTTS();
  const { startListening, reset: resetRec, state: recState, transcript, errorMsg } = useSpeechRecognition();

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(phrase.english); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRecord = () => {
    setShowMic(true);
    setScore(null);
    startListening((text) => {
      setScore(similarity(phrase.english, text));
    });
  };

  const handleMicClose = () => {
    resetRec();
    setShowMic(false);
    setScore(null);
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 active:border-indigo-500/50 transition-colors">
      {/* Situation badge */}
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 mb-2 inline-block">
        {phrase.situation}
      </span>

      {/* English */}
      <p className="text-white font-semibold text-lg leading-snug">{phrase.english}</p>

      {/* Japanese */}
      <p className="text-slate-400 mt-0.5 text-sm">{phrase.japanese}</p>

      {/* Tips */}
      {phrase.tips && (
        <p className="text-xs text-amber-400 mt-2 flex items-start gap-1">
          <span className="shrink-0">💡</span> {phrase.tips}
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 mt-3">
        {/* TTS */}
        <button
          onClick={() => speak(phrase.english)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            speaking
              ? "bg-indigo-600 text-white"
              : "bg-slate-700 text-slate-300 active:bg-slate-600"
          }`}
        >
          <span>{speaking ? "🔊" : "🔈"}</span>
          <span>{speaking ? "再生中" : "聞く"}</span>
        </button>

        {/* Mic */}
        <button
          onClick={showMic ? handleMicClose : handleRecord}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            recState === "listening"
              ? "bg-rose-600 text-white animate-pulse"
              : showMic
              ? "bg-slate-600 text-slate-200"
              : "bg-slate-700 text-slate-300 active:bg-slate-600"
          }`}
        >
          <span>🎤</span>
          <span>{recState === "listening" ? "録音中" : showMic ? "閉じる" : "練習"}</span>
        </button>

        {/* Copy */}
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            copied ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400 active:bg-slate-600"
          }`}
        >
          <span>{copied ? "✓" : "📋"}</span>
          <span>{copied ? "コピー済" : "コピー"}</span>
        </button>

        {/* Bookmark */}
        <button
          onClick={onToggleReview}
          className={`ml-auto px-3 py-2 rounded-lg text-sm transition-all ${
            isReviewed ? "text-amber-400" : "text-slate-500 active:text-slate-300"
          }`}
          aria-label={isReviewed ? "復習リストから削除" : "復習リストに追加"}
        >
          {isReviewed ? "⭐" : "☆"}
        </button>
      </div>

      {/* Recognition result */}
      {showMic && (recState === "done" || recState === "error") && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${
          recState === "error"
            ? "bg-slate-700/50"
            : score !== null && score >= 0.7
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : "bg-amber-500/10 border border-amber-500/20"
        }`}>
          {recState === "error" ? (
            <p className="text-slate-400 text-xs">{errorMsg}</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-0.5">あなたの発音</p>
              <p className="text-white">"{transcript}"</p>
              {score !== null && (
                <p className={`text-xs mt-1 font-semibold ${
                  score >= 0.7 ? "text-emerald-400" : "text-amber-400"
                }`}>
                  {score >= 0.7 ? "よくできました！ 🎉" : "もう一度試してみて 💪"}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
