"use client";
import { useEffect, useState } from "react";
import { SUMMER_WORDS, type SummerWord } from "../data/summerWords";
import { useTTS } from "../hooks/useSpeech";
import type { SummerProgress } from "../api/summer/progress/route";
import type { SummerRankEntry } from "../api/summer/ranking/route";

type Phase = "home" | "quiz" | "result";
type Pattern = 1 | 2;

interface SessionQuestion {
  word: SummerWord;
  pattern: Pattern;
}

interface SessionAnswer {
  wordId: number;
  pattern: Pattern;
  correct: boolean;
}

const SET_SIZE = 20;

const emptyProgress: SummerProgress = {
  perWord: {}, correctTotal: 0, answeredTotal: 0, coveredWords: [], lastUpdated: "",
};

function normalizeJp(s: string): string {
  return s.replace(/[\s　]/g, "");
}

function checkAnswer(pattern: Pattern, word: SummerWord, input: string): boolean {
  if (!input.trim()) return false;
  if (pattern === 2) {
    return input.trim().toLowerCase() === word.english.trim().toLowerCase();
  }
  const candidates = word.japanese.split(/[、,\/／・]/).map(normalizeJp).filter(Boolean);
  const norm = normalizeJp(input);
  return candidates.includes(norm) || normalizeJp(word.japanese) === norm;
}

function pickWeightedWords(perWord: SummerProgress["perWord"], n: number): SummerWord[] {
  const scored = SUMMER_WORDS.map((w) => {
    const stat = perWord[w.id] ?? { exposure: 0, wrong: 0 };
    const weight = (1 / (stat.exposure + 1)) * (1 + stat.wrong);
    const key = Math.random() ** (1 / weight);
    return { w, key };
  });
  scored.sort((a, b) => b.key - a.key);
  return scored.slice(0, n).map((s) => s.w);
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildRound1(words: SummerWord[]): SessionQuestion[] {
  const shuffled = shuffle(words);
  const patternA = shuffled.slice(0, 10).map((w) => ({ word: w, pattern: 1 as Pattern }));
  const patternB = shuffled.slice(10, 20).map((w) => ({ word: w, pattern: 2 as Pattern }));
  return shuffle([...patternA, ...patternB]);
}

function buildRound2(round1: SessionQuestion[]): SessionQuestion[] {
  const flipped = round1.map((q) => ({ word: q.word, pattern: (q.pattern === 1 ? 2 : 1) as Pattern }));
  return shuffle(flipped);
}

function applySession(prev: SummerProgress, sessionWords: SummerWord[], answers: SessionAnswer[]): SummerProgress {
  const perWord = { ...prev.perWord };
  answers.forEach((a) => {
    const cur = perWord[a.wordId] ?? { exposure: 0, wrong: 0 };
    perWord[a.wordId] = { exposure: cur.exposure + 1, wrong: cur.wrong + (a.correct ? 0 : 1) };
  });
  const coveredSet = new Set(prev.coveredWords);
  sessionWords.forEach((w) => coveredSet.add(w.id));
  return {
    perWord,
    correctTotal:  prev.correctTotal + answers.filter((a) => a.correct).length,
    answeredTotal: prev.answeredTotal + answers.length,
    coveredWords:  Array.from(coveredSet),
    lastUpdated:   new Date().toISOString().split("T")[0],
  };
}

export default function SummerMode({ onBack }: { onBack: () => void }) {
  const [nickname,        setNicknameState]   = useState<string | null>(null);
  const [nicknameInput,   setNicknameInput]   = useState("");
  const [editingNickname, setEditingNickname] = useState(false);

  const [progress, setProgress] = useState<SummerProgress | null>(null);
  const [ranking,  setRanking]  = useState<SummerRankEntry[] | null>(null);
  const [phase,    setPhase]    = useState<Phase>("home");

  const [sessionWords,   setSessionWords]   = useState<SummerWord[]>([]);
  const [round1,         setRound1]         = useState<SessionQuestion[]>([]);
  const [round2,         setRound2]         = useState<SessionQuestion[]>([]);
  const [currentRound,   setCurrentRound]   = useState<1 | 2>(1);
  const [currentIndex,   setCurrentIndex]   = useState(0);
  const [answerInput,    setAnswerInput]    = useState("");
  const [submitted,      setSubmitted]      = useState(false);
  const [isCorrect,      setIsCorrect]      = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState<SessionAnswer[]>([]);
  const [saving,         setSaving]         = useState(false);

  const { speak } = useTTS();

  useEffect(() => {
    try {
      const n = localStorage.getItem("nickname_v1");
      if (n) setNicknameState(n);
    } catch {}
  }, []);

  const loadData = async (name: string) => {
    setProgress(null);
    setRanking(null);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`/api/summer/progress?nickname=${encodeURIComponent(name)}`),
        fetch("/api/summer/ranking"),
      ]);
      const pJson = await pRes.json();
      const rJson = await rRes.json();
      setProgress(pRes.ok ? pJson.progress : emptyProgress);
      setRanking(rRes.ok ? rJson.ranking : []);
    } catch {
      setProgress(emptyProgress);
      setRanking([]);
    }
  };

  useEffect(() => { if (nickname) loadData(nickname); }, [nickname]);

  const saveNickname = () => {
    const name = nicknameInput.trim().slice(0, 12);
    if (!name) return;
    try { localStorage.setItem("nickname_v1", name); } catch {}
    setNicknameState(name);
    setEditingNickname(false);
    setNicknameInput("");
  };

  const startSet = () => {
    if (!progress) return;
    const words = pickWeightedWords(progress.perWord, Math.min(SET_SIZE, SUMMER_WORDS.length));
    const r1 = buildRound1(words);
    const r2 = buildRound2(r1);
    setSessionWords(words);
    setRound1(r1);
    setRound2(r2);
    setCurrentRound(1);
    setCurrentIndex(0);
    setSessionAnswers([]);
    setAnswerInput("");
    setSubmitted(false);
    setPhase("quiz");
  };

  const currentQuestions = currentRound === 1 ? round1 : round2;
  const currentQ = currentQuestions[currentIndex];

  const submitAnswer = () => {
    if (!currentQ || submitted) return;
    const correct = checkAnswer(currentQ.pattern, currentQ.word, answerInput);
    setIsCorrect(correct);
    setSubmitted(true);
    setSessionAnswers((a) => [...a, { wordId: currentQ.word.id, pattern: currentQ.pattern, correct }]);
  };

  const finishSession = async (answers: SessionAnswer[]) => {
    if (!nickname || !progress) return;
    setSaving(true);
    const updated = applySession(progress, sessionWords, answers);
    try {
      await fetch("/api/summer/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, progress: updated }),
      });
    } catch {}
    setProgress(updated);
    try {
      const rRes = await fetch("/api/summer/ranking");
      const rJson = await rRes.json();
      setRanking(rRes.ok ? rJson.ranking : []);
    } catch {}
    setSaving(false);
    setPhase("result");
  };

  const nextQuestion = () => {
    const next = currentIndex + 1;
    if (next < currentQuestions.length) {
      setCurrentIndex(next);
      setAnswerInput("");
      setSubmitted(false);
      return;
    }
    if (currentRound === 1) {
      setCurrentRound(2);
      setCurrentIndex(0);
      setAnswerInput("");
      setSubmitted(false);
      return;
    }
    // 40問終了
    const finalAnswers = sessionAnswers;
    finishSession(finalAnswers);
  };

  const round1Score = sessionAnswers.filter((a, i) => i < 20 && a.correct).length;
  const round2Score = sessionAnswers.filter((a, i) => i >= 20 && a.correct).length;

  const myRank = ranking?.find((r) => r.nickname === nickname);

  // ── ニックネーム登録待ち ──────────────────────────────
  if (!nickname || editingNickname) {
    return (
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <Header title="夏休み課題対策モード" onBack={onBack} />
        <main style={{ padding: "8px 16px 40px" }}>
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 20 }}>
            <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              👤 ニックネームを登録
            </p>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>
              ランキングに表示される名前です（最大12文字）。ランキング機能と共通です。
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value.slice(0, 12))}
                onKeyDown={(e) => e.key === "Enter" && saveNickname()}
                placeholder="例：さくら"
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "#0f172a",
                         border: "1px solid #334155", color: "#e2e8f0", fontSize: 16, outline: "none" }}
              />
              <button onClick={saveNickname} disabled={!nicknameInput.trim()}
                style={{ background: nicknameInput.trim() ? "#ea580c" : "#1e293b", border: "none",
                         borderRadius: 10, padding: "10px 18px", color: "#fff",
                         cursor: nicknameInput.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 600 }}>
                登録
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── ホーム ────────────────────────────────────────────
  if (phase === "home") {
    const coveredCount = progress?.coveredWords.length ?? 0;
    const accuracyPct  = progress && progress.answeredTotal > 0
      ? Math.round((progress.correctTotal / progress.answeredTotal) * 1000) / 10
      : 0;
    const totalScore = myRank?.totalScore ?? 0;

    return (
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <Header title="夏休み課題対策モード" onBack={onBack} nickname={nickname}
          onEditNickname={() => { setNicknameInput(nickname); setEditingNickname(true); }} />
        <main style={{ padding: "8px 16px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "linear-gradient(135deg,#ea580c,#facc15)", borderRadius: 20,
                        padding: 20, color: "#431407" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>夏休み単語チャレンジ</h2>
            <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
              ターゲット400語から出題。1セット＝クイズ20問＋復習20問（同じ単語で英→日／日→英を入れ替え）。回答は選択肢ではなく入力式です。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
              {[
                { v: progress ? `${coveredCount}/400` : "…", l: "制覇語数" },
                { v: progress ? `${accuracyPct}%` : "…", l: "正解率" },
                { v: progress ? totalScore : "…", l: "合計pt" },
                { v: myRank ? `${myRank.rank}位` : "-", l: "順位" },
              ].map(({ v, l }) => (
                <div key={l} style={{ background: "rgba(255,255,255,0.35)", borderRadius: 12,
                                      padding: "10px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{v}</div>
                  <div style={{ fontSize: 10 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={startSet} disabled={!progress}
            style={{ background: progress ? "linear-gradient(135deg,#c2410c,#eab308)" : "#1e293b",
                     border: "none", borderRadius: 16, padding: "18px", color: "#fff",
                     fontWeight: 700, fontSize: 17, cursor: progress ? "pointer" : "default" }}>
            {progress ? "クイズを開始する（40問）" : "読み込み中…"}
          </button>

          <button disabled
            style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16,
                     padding: "16px", color: "#64748b", fontWeight: 700, fontSize: 16,
                     cursor: "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            単語テスト
            <span style={{ background: "#334155", color: "#94a3b8", fontSize: 11, fontWeight: 600,
                           borderRadius: 999, padding: "3px 10px" }}>
              後日公開予定
            </span>
          </button>

          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
            <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              🏆 夏休みモード ランキング
            </p>
            <p style={{ color: "#facc15", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
              ランキング1位にはもちろん特典あり！
            </p>
            {ranking === null ? (
              <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0" }}>読み込み中...</p>
            ) : ranking.length === 0 ? (
              <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
                まだ記録がありません。最初のクイズに挑戦しましょう！
              </p>
            ) : (
              ranking.map((r) => (
                <div key={r.nickname} style={{ display: "flex", alignItems: "center", gap: 10,
                                              padding: "8px 0", borderBottom: "1px solid #334155" }}>
                  <span style={{ width: 30, textAlign: "center", color: "#94a3b8", fontSize: 13, fontWeight: 700 }}>
                    {r.rank}位
                  </span>
                  <span style={{ flex: 1, color: r.nickname === nickname ? "#fbbf24" : "#e2e8f0",
                                 fontWeight: r.nickname === nickname ? 700 : 500, fontSize: 14 }}>
                    {r.nickname}{r.nickname === nickname && <span style={{ fontSize: 10, marginLeft: 6 }}>（あなた）</span>}
                  </span>
                  <span style={{ color: "#64748b", fontSize: 11 }}>
                    正解率{r.accuracyPct}% ／ {r.coveredCount}語
                  </span>
                  <span style={{ color: "#facc15", fontWeight: 800, fontSize: 15 }}>{r.totalScore}pt</span>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── クイズ（クイズ・復習共通） ──────────────────────────
  if (phase === "quiz") {
    if (!currentQ) return null;
    const roundLabel = currentRound === 1 ? "1回目：クイズ" : "2回目：復習";
    const promptLabel = currentQ.pattern === 1 ? "日本語の意味を入力してください" : "英単語を入力してください";
    const promptText  = currentQ.pattern === 1 ? currentQ.word.english : currentQ.word.japanese;

    return (
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <Header title="夏休み課題対策モード" onBack={onBack} />
        <main style={{ padding: "8px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#facc15", fontWeight: 700, fontSize: 13 }}>{roundLabel}</span>
            <span style={{ color: "#94a3b8", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              {currentIndex + 1} / {currentQuestions.length}
            </span>
          </div>
          <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${((currentIndex) / currentQuestions.length) * 100}%`, height: "100%",
                          background: "#eab308", transition: "width 0.3s ease" }} />
          </div>

          <div style={{ background: "linear-gradient(135deg,#c2410c,#eab308)", borderRadius: 20,
                        padding: 28, textAlign: "center", color: "#fff" }}>
            <p style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>{promptLabel}</p>
            <p style={{ fontSize: currentQ.pattern === 1 ? 32 : 20, fontWeight: 800, lineHeight: 1.4 }}>
              {promptText}
            </p>
            {currentQ.pattern === 1 && (
              <button onClick={() => speak(currentQ.word.english)}
                style={{ marginTop: 12, background: "rgba(255,255,255,0.25)", border: "none",
                         borderRadius: 999, padding: "8px 18px", color: "#fff", fontWeight: 600,
                         fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                🔊 発音を聞く
              </button>
            )}
          </div>

          {!submitted ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                placeholder={currentQ.pattern === 1 ? "例：達成する" : "例：achieve"}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: "#1e293b",
                         border: "1px solid #334155", color: "#e2e8f0", fontSize: 17, outline: "none" }}
              />
              <button onClick={submitAnswer} disabled={!answerInput.trim()}
                style={{ background: answerInput.trim() ? "#ea580c" : "#1e293b", border: "none",
                         borderRadius: 12, padding: "12px 22px", color: "#fff", fontWeight: 700,
                         fontSize: 15, cursor: answerInput.trim() ? "pointer" : "default" }}>
                回答
              </button>
            </div>
          ) : (
            <div style={{ background: isCorrect ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                          border: `1px solid ${isCorrect ? "#10b981" : "#ef4444"}`,
                          borderRadius: 14, padding: 16, textAlign: "center" }}>
              <p style={{ color: isCorrect ? "#34d399" : "#f87171", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                {isCorrect ? "正解！ 🎉" : "不正解 😢"}
              </p>
              <p style={{ color: "#cbd5e1", fontSize: 14 }}>
                {currentQ.word.english} ＝ {currentQ.word.japanese}
              </p>
              <p style={{ color: "#64748b", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                {currentQ.word.example}
              </p>
              <button onClick={nextQuestion} disabled={saving}
                style={{ marginTop: 12, background: "#ea580c", border: "none", borderRadius: 10,
                         padding: "10px 24px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {saving ? "保存中…" : "次へ →"}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── 結果 ──────────────────────────────────────────────
  const coveredCount = progress?.coveredWords.length ?? 0;
  const accuracyPct  = progress && progress.answeredTotal > 0
    ? Math.round((progress.correctTotal / progress.answeredTotal) * 1000) / 10
    : 0;

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
      <Header title="夏休み課題対策モード" onBack={onBack} />
      <main style={{ padding: "8px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ fontSize: 48 }}>{round1Score + round2Score >= 32 ? "🎉" : "📚"}</p>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>1セット終了！</h2>
        </div>
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { n: `${round1Score}/20`, l: "クイズ" },
              { n: `${round2Score}/20`, l: "復習" },
              { n: `${round1Score + round2Score}/40`, l: "合計" },
            ].map((t) => (
              <div key={t.l} style={{ background: "#0f172a", borderRadius: 10, padding: "10px 4px", textAlign: "center" }}>
                <div style={{ color: "#facc15", fontWeight: 700, fontSize: 16 }}>{t.n}</div>
                <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>{t.l}</div>
              </div>
            ))}
          </div>
          <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📊 現在の累計</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { n: `${coveredCount}/400`, l: "制覇語数" },
              { n: `${accuracyPct}%`, l: "正解率" },
              { n: `${myRank?.totalScore ?? 0}pt`, l: "合計ポイント" },
            ].map((t) => (
              <div key={t.l} style={{ background: "#0f172a", borderRadius: 10, padding: "10px 4px", textAlign: "center" }}>
                <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>{t.n}</div>
                <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>{t.l}</div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => setPhase("home")}
          style={{ background: "linear-gradient(135deg,#c2410c,#eab308)", border: "none", borderRadius: 16,
                   padding: "16px", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
          ホームに戻る
        </button>
      </main>
    </div>
  );
}

function Header({ title, onBack, nickname, onEditNickname }: {
  title: string; onBack: () => void; nickname?: string; onEditNickname?: () => void;
}) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                     gap: 10, padding: "max(10px,env(safe-area-inset-top)) 16px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack}
          style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px",
                   color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>
          ‹
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>☀️ {title}</h1>
      </div>
      {nickname && onEditNickname && (
        <button onClick={onEditNickname}
          style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
                   padding: "4px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>
          👤 {nickname}
        </button>
      )}
    </header>
  );
}
