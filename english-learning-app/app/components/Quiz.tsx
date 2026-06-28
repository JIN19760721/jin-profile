"use client";
import { useState, useCallback } from "react";
import type { Word } from "../data/vocabulary";

interface QuizProps {
  words:      Word[];
  mode?:      "eikaiwa" | "toeic";
  part5Style?: boolean;  // Part5風の穴埋め表示
  mockMode?:   boolean;  // 模試モード（次へボタンのみ、解説省略）
  onComplete?: (score: number, total: number) => void;
  onWrong?:    (wordId: number) => void;  // 不正解時のコールバック
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildOptions(words: Word[], target: Word): Word[] {
  const others = words.filter((w) => w.id !== target.id);
  return shuffle([target, ...shuffle(others).slice(0, 3)]);
}

// Part5スタイル: 例文の単語をブランクにした問題文を生成
function makePart5Question(word: Word): string {
  if (!word.example || word.example.trim() === "") {
    return `The word "______" means: ${word.japanese}`;
  }
  const regex = new RegExp(`\\b${word.english}\\b`, "gi");
  const blanked = word.example.replace(regex, "______");
  if (blanked === word.example) {
    return `Fill in the blank: ______ (${word.japanese})`;
  }
  return blanked;
}

export default function Quiz({ words, mode = "eikaiwa", part5Style = false, mockMode = false, onComplete, onWrong }: QuizProps) {
  const [questionWords, setQuestionWords] = useState(() => shuffle(words));
  const [qIndex,   setQIndex]   = useState(0);
  const [options,  setOptions]  = useState(() => buildOptions(words, shuffle(words)[0]));
  const [selected, setSelected] = useState<number | null>(null);
  const [score,    setScore]    = useState(0);
  const [finished, setFinished] = useState(false);

  const target    = questionWords[qIndex];
  const isCorrect = selected !== null && options[selected].id === target.id;
  const accentCol = mode === "toeic" ? "#22d3ee" : "#818cf8";

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    const correct = options[idx].id === target.id;
    if (correct) setScore((s) => s + 1);
    else onWrong?.(target.id);
  };

  const handleNext = useCallback(() => {
    const next = qIndex + 1;
    if (next >= questionWords.length) {
      setFinished(true);
      onComplete?.(score + (isCorrect ? 0 : 0), questionWords.length);
      return;
    }
    setQIndex(next);
    setOptions(buildOptions(words, questionWords[next]));
    setSelected(null);
  }, [qIndex, questionWords, words, score, isCorrect, onComplete]);

  // 正解時に自動で次へ（模試モード）
  const handleSelectMock = (idx: number) => {
    if (selected !== null) return;
    const correct = options[idx].id === target.id;
    setSelected(idx);
    if (correct) setScore((s) => s + 1);
    else onWrong?.(target.id);
    if (mockMode) setTimeout(handleNext, 600);
  };

  const handleRestart = () => {
    const s = shuffle(words);
    setQuestionWords(s);
    setQIndex(0);
    setOptions(buildOptions(words, s[0]));
    setSelected(null);
    setScore(0);
    setFinished(false);
  };

  if (finished) {
    const pct = Math.round((score / words.length) * 100);
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-6xl">{pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "📚"}</div>
        <h2 className="text-2xl font-bold text-white">クイズ終了！</h2>
        <div className="bg-slate-800 rounded-2xl p-8 text-center w-full max-w-xs">
          <p className="text-slate-400 text-sm mb-2">{words.length}問中</p>
          <p style={{ fontSize: 52, fontWeight: 800, color: accentCol }}>
            {score}<span className="text-2xl text-slate-400">/{words.length}</span>
          </p>
          <p className="text-slate-400 mt-1">正解率 {pct}%</p>
          <p className="text-slate-300 mt-3 text-sm">
            {pct >= 80 ? "素晴らしい！完璧な成績です！" : pct >= 50 ? "良い成績です！復習を続けましょう。" : "もう少し！基礎から復習しましょう。"}
          </p>
        </div>
        <button onClick={handleRestart}
          className="px-8 py-3 rounded-xl text-white font-semibold transition-colors"
          style={{ background: accentCol }}>
          もう一度チャレンジ
        </button>
      </div>
    );
  }

  const questionText = part5Style ? makePart5Question(target) : null;

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto w-full">
      {/* 進捗 */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>問題 {qIndex + 1} / {questionWords.length}</span>
        <span className="font-medium" style={{ color: accentCol }}>正解: {score}</span>
      </div>

      {/* 問題カード */}
      <div className="rounded-2xl p-6 text-center shadow-2xl"
        style={{ background: mode === "toeic"
          ? "linear-gradient(135deg,#0f766e,#0284c7)"
          : "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
        {part5Style && questionText ? (
          <>
            <p className="text-xs mb-3 opacity-70">空欄に入る単語を選んでください</p>
            <p className="text-sm text-white leading-relaxed text-left px-2"
              dangerouslySetInnerHTML={{ __html: questionText.replace("______", '<span style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:4px;font-weight:700">______</span>') }} />
            <p className="text-xs mt-3 opacity-60">{target.katakana}</p>
          </>
        ) : (
          <>
            <p className="text-xs mb-2 opacity-70">次の英単語の意味は？</p>
            <p className="text-4xl font-bold text-white">{target.english}</p>
            <p className="mt-2 opacity-70 text-sm">{target.katakana}</p>
          </>
        )}
      </div>

      {/* 選択肢 */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, idx) => {
          let bg = "bg-slate-800 border border-slate-700 text-white";
          if (selected !== null) {
            if (opt.id === target.id)  bg = "bg-emerald-500/20 border border-emerald-500 text-emerald-300";
            else if (idx === selected) bg = "bg-rose-500/20 border border-rose-500 text-rose-300";
            else                       bg = "bg-slate-800 border border-slate-700 text-slate-500 opacity-50";
          }
          return (
            <button key={opt.id}
              onClick={() => mockMode ? handleSelectMock(idx) : handleSelect(idx)}
              className={`rounded-xl p-4 text-center font-medium transition-all text-sm ${bg}`}>
              {opt.japanese}
            </button>
          );
        })}
      </div>

      {/* 解説（模試モード以外） */}
      {selected !== null && !mockMode && (
        <div className={`rounded-xl p-4 text-center ${
          isCorrect ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-rose-500/10 border border-rose-500/30"
        }`}>
          <p className={`font-semibold ${isCorrect ? "text-emerald-400" : "text-rose-400"}`}>
            {isCorrect ? "正解！ 🎉" : `不正解 😢 → ${target.japanese}`}
          </p>
          {target.example && (
            <p className="text-slate-300 text-sm mt-1 italic">"{target.example}"</p>
          )}
          <button onClick={handleNext}
            className="mt-3 px-6 py-2 rounded-lg text-white text-sm font-medium transition-colors"
            style={{ background: accentCol }}>
            次の問題 →
          </button>
        </div>
      )}
    </div>
  );
}
