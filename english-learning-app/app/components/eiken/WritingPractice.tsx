"use client";
import { useEffect, useRef, useState } from "react";
import { eikenStore, useEikenStore } from "../../hooks/useEikenStore";
import { useTTS } from "../../hooks/useSpeech";
import { TEMPLATE_LINES } from "../../data/eikenWriting";
import { essayKey, requestGrade, ApiError } from "../../lib/eiken/client";
import {
  countWords, hasNonEnglish, MAX_ESSAY_CHARS, OPINION_MAX_WORDS, OPINION_MIN_WORDS, wordCountStatus,
} from "../../lib/eiken/text";
import { CRITERIA, CRITERION_LABEL, TAG_LABEL, type WritingAttempt, type WritingQuestion } from "../../lib/eiken/types";
import { saveGradedAttempt } from "./actions";
import { Bar, Btn, C, Card, CardTitle, Pill, scoreColor, SubHeader } from "./ui";

const DEFAULT_LIMIT_SEC = 20 * 60;

interface Props {
  question:   WritingQuestion;
  showTemplateDefault: boolean;
  limitSec?:  number;            // 残り時間の基準（「今日の15分」では短くする）
  timed?:     boolean;           // 時間制限付き演習
  initialAttemptId?: string;     // 結果画面から開く場合
  onBack:     () => void;
  onGraded?:  (attemptId: string) => void;
}

type Phase = "write" | "grading" | "result";

const fmt = (sec: number) => `${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, "0")}`;

export default function WritingPractice({
  question, showTemplateDefault, limitSec = DEFAULT_LIMIT_SEC, timed = false, initialAttemptId, onBack, onGraded,
}: Props) {
  const { data, drafts } = useEikenStore();
  const [attemptId, setAttemptId] = useState<string | undefined>(initialAttemptId);
  const [phase, setPhase] = useState<Phase>(initialAttemptId ? "result" : "write");
  const draftKey = attemptId ? `rw:${attemptId}` : question.id;

  // 下書きの復元（書き直しのときは前回の英文から始める）
  const [text, setText] = useState(() => {
    const d = drafts[draftKey];
    if (d) return d.text;
    if (attemptId) {
      const a = data.attempts.find((x) => x.id === attemptId);
      return a?.rounds.at(-1)?.essay ?? "";
    }
    return "";
  });
  const [seconds, setSeconds] = useState(() => drafts[draftKey]?.seconds ?? 0);
  const [restored] = useState(() => Boolean(drafts[draftKey]?.text));

  const [showJp, setShowJp] = useState(false);
  const [showTemplate, setShowTemplate] = useState(showTemplateDefault);
  const [hintLevel, setHintLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gradingSec, setGradingSec] = useState(0);
  const busy = useRef(false);
  const { speak } = useTTS();

  // タイマー（書いている間だけ進める。画面が裏にあるときは止める）
  useEffect(() => {
    if (phase !== "write") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // 自動保存（入力が止まって0.8秒後、または10秒ごと）
  const latest = useRef({ text, seconds });
  useEffect(() => { latest.current = { text, seconds }; }, [text, seconds]);
  useEffect(() => {
    if (phase !== "write") return;
    const t = setTimeout(() => {
      if (text.trim()) eikenStore.saveDraft(draftKey, { text, seconds: latest.current.seconds, updatedAt: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(t);
  }, [text, draftKey, phase]);
  useEffect(() => {
    if (phase !== "write") return;
    const t = setInterval(() => {
      const { text: tx, seconds: sc } = latest.current;
      if (tx.trim()) eikenStore.saveDraft(draftKey, { text: tx, seconds: sc, updatedAt: new Date().toISOString() });
    }, 10_000);
    return () => clearInterval(t);
  }, [draftKey, phase]);

  // 採点中に画面を閉じようとしたら確認する
  useEffect(() => {
    if (phase !== "grading") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    const t = setInterval(() => setGradingSec((s) => s + 1), 1000);
    return () => { window.removeEventListener("beforeunload", onBeforeUnload); clearInterval(t); };
  }, [phase]);

  const words = countWords(text);
  const wStatus = wordCountStatus(words);
  const remaining = limitSec - seconds;
  const attempt: WritingAttempt | undefined = attemptId ? data.attempts.find((a) => a.id === attemptId) : undefined;

  const grade = async () => {
    if (busy.current) return;
    setError(null);
    if (hasNonEnglish(text)) { setError("日本語や全角の文字が入っています。英語（半角）だけで書いてください。"); return; }
    if (words < 10) { setError("10語以上書いてから採点しましょう。"); return; }
    busy.current = true;
    const key = essayKey(question.id, text);
    const cached = data.gradeCache[key];
    const lastRound = attempt?.rounds.at(-1);
    if (lastRound && essayKey(question.id, lastRound.essay) === key) {
      // 前回と同じ英文なら採点し直さない
      setError("前回と同じ英文です。直してから採点しましょう。");
      busy.current = false;
      return;
    }
    setGradingSec(0);
    setPhase("grading");
    try {
      const result = cached ?? (await requestGrade(question.id, question.question, text)).result;
      const id = saveGradedAttempt({ question, essay: text, result, seconds, attemptId, cacheKey: key });
      eikenStore.saveDraft(draftKey, null);
      setAttemptId(id);
      setPhase("result");
      onGraded?.(id);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "採点に失敗しました。もう一度試してください。");
      setPhase("write");
    } finally {
      busy.current = false;
    }
  };

  const startRewrite = () => {
    if (!attempt) return;
    const last = attempt.rounds.at(-1);
    setText(drafts[`rw:${attempt.id}`]?.text ?? last?.essay ?? "");
    setSeconds(0);
    setHintLevel(0);
    setError(null);
    setPhase("write");
    window.scrollTo({ top: 0 });
  };

  if (phase === "result" && attempt) {
    return <ResultView question={question} attempt={attempt} onBack={onBack} onRewrite={startRewrite} speak={speak} />;
  }

  // ── 書く画面 ──
  const timerColor = remaining < 0 ? C.bad : remaining < 120 ? C.warn : C.sub;
  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
      <SubHeader
        title={attempt ? "✍️ 書き直し" : timed ? "⏱ 時間を計って書く" : "✍️ 意見論述"}
        onBack={onBack}
        right={
          <span style={{ color: timerColor, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {remaining >= 0 ? `残り ${fmt(remaining)}` : `${fmt(remaining)} 超過`}
          </span>
        }
      />
      <main style={{ padding: "14px 16px 140px", display: "flex", flexDirection: "column", gap: 14 }}>
        {restored && phase === "write" && (
          <p style={{ color: C.accent, fontSize: 13 }}>💾 前回の続きから再開しました</p>
        )}

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Pill>QUESTION</Pill>
            <div style={{ display: "flex", gap: 6 }}>
              <SmallBtn onClick={() => speak(question.question)}>🔊</SmallBtn>
              <SmallBtn onClick={() => setShowJp((v) => !v)}>{showJp ? "訳を隠す" : "日本語訳"}</SmallBtn>
            </div>
          </div>
          <p style={{ color: C.text, fontSize: 17, lineHeight: 1.6, fontWeight: 600 }}>{question.question}</p>
          {showJp && <p style={{ color: C.sub, fontSize: 14, marginTop: 6 }}>{question.questionJp}</p>}
          <p style={{ color: C.muted, fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
            意見と理由を<b style={{ color: C.text }}>2つ</b>書きます。語数の目安は{OPINION_MIN_WORDS}〜{OPINION_MAX_WORDS}語です。
          </p>
        </Card>

        <div style={{ display: "flex", gap: 8 }}>
          <Toggle on={showTemplate} onClick={() => setShowTemplate((v) => !v)}>📋 テンプレート</Toggle>
          <Toggle on={hintLevel > 0} onClick={() => setHintLevel((h) => (h >= 2 ? 0 : h + 1))}>
            💡 ヒント{hintLevel > 0 ? `（${hintLevel}/2）` : ""}
          </Toggle>
        </div>

        {showTemplate && (
          <Card style={{ padding: 12 }}>
            {TEMPLATE_LINES.map((l) => (
              <div key={l.en} style={{ display: "flex", gap: 10, padding: "6px 0", alignItems: "baseline" }}>
                <button onClick={() => setText((t) => (t.trim() ? `${t.trimEnd()} ${l.en.replace("...", "")}` : l.en.replace("...", "")))}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.accent,
                           fontSize: 14, fontWeight: 700, padding: "6px 10px", cursor: "pointer", flexShrink: 0 }}>
                  {l.en}
                </button>
                <span style={{ color: C.sub, fontSize: 13 }}>{l.jp}</span>
              </div>
            ))}
            <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>ボタンを押すと、書き出しが入力欄に入ります。</p>
          </Card>
        )}

        {hintLevel > 0 && (
          <Card style={{ padding: 12 }}>
            <p style={{ color: C.text, fontSize: 14, marginBottom: 8 }}>{question.hintJp}</p>
            {hintLevel >= 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: hintLevel >= 2 ? 10 : 0 }}>
                {question.usefulWords.map((w) => (
                  <span key={w.en} style={{ background: C.bg, borderRadius: 8, padding: "4px 8px", fontSize: 13, color: C.text }}>
                    {w.en} <span style={{ color: C.muted }}>{w.jp}</span>
                  </span>
                ))}
              </div>
            )}
            {hintLevel >= 2 && question.ideas.map((idea) => (
              <div key={idea.side} style={{ marginTop: 6 }}>
                <p style={{ color: idea.side === "yes" ? C.good : C.warn, fontSize: 13, fontWeight: 700 }}>
                  {idea.side === "yes" ? "賛成の理由の例" : "反対の理由の例"}
                </p>
                {idea.reasons.map((r) => <p key={r} style={{ color: C.sub, fontSize: 14, lineHeight: 1.6 }}>・{r}</p>)}
              </div>
            ))}
          </Card>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_ESSAY_CHARS))}
          placeholder="ここに英語で書きます"
          disabled={phase === "grading"}
          autoCapitalize="sentences" autoCorrect="off" spellCheck={false}
          style={{
            width: "100%", minHeight: 260, background: C.bg, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 14, padding: 14,
            fontSize: 17, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            color: wStatus === "ok" ? C.good : wStatus === "long" ? C.warn : C.sub,
          }}>
            {words} 語 {wStatus === "ok" ? "✓ ちょうどいい長さ" : wStatus === "short" ? `（あと${OPINION_MIN_WORDS - words}語）` : "（少し長めです）"}
          </span>
          <span style={{ color: C.muted, fontSize: 12 }}>{text.length}/{MAX_ESSAY_CHARS}文字</span>
        </div>

        {error && (
          <p role="alert" style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${C.bad}`, color: "#fca5a5",
                                   borderRadius: 12, padding: 12, fontSize: 14 }}>{error}</p>
        )}

        {phase === "grading" ? (
          <GradingProgress sec={gradingSec} />
        ) : (
          <div style={{ position: "sticky", bottom: "calc(16px + env(safe-area-inset-bottom,0px))" }}>
            <Btn onClick={grade} disabled={words === 0}>🤖 AIで採点する</Btn>
          </div>
        )}
        <p style={{ color: C.muted, fontSize: 12, textAlign: "center" }}>
          書いた内容は自動で保存されます。AI採点は練習用の参考評価です。
        </p>
      </main>
    </div>
  );
}

function GradingProgress({ sec }: { sec: number }) {
  const steps = [
    { at: 0,  label: "英文を送っています" },
    { at: 3,  label: "AIが4つの観点で採点しています" },
    { at: 15, label: "文法の直しと模範解答を作っています" },
    { at: 35, label: "もう少しで終わります" },
  ];
  const cur = steps.filter((s) => sec >= s.at).length - 1;
  return (
    <Card style={{ textAlign: "center" }}>
      <p style={{ color: C.accent, fontSize: 16, fontWeight: 700 }}>⏳ {steps[cur].label}</p>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "12px 0" }}>
        {steps.map((s, i) => (
          <span key={s.at} style={{ width: 36, height: 6, borderRadius: 3, background: i <= cur ? C.accent2 : C.border }} />
        ))}
      </div>
      <p style={{ color: C.muted, fontSize: 13 }}>{sec}秒 ・ ふつうは20〜40秒ほどかかります。この画面のままお待ちください。</p>
    </Card>
  );
}

function ResultView({ question, attempt, onBack, onRewrite, speak }: {
  question: WritingQuestion; attempt: WritingAttempt; onBack: () => void; onRewrite: () => void; speak: (t: string) => void;
}) {
  const [showModelJp, setShowModelJp] = useState(false);
  const round = attempt.rounds.at(-1)!;
  const first = attempt.rounds[0];
  const r = round.result;
  const rewrites = attempt.rounds.length > 1;

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
      <SubHeader title="🤖 添削結果" onBack={onBack} />
      <main style={{ padding: "14px 16px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={{ textAlign: "center" }}>
          <p style={{ color: C.sub, fontSize: 13 }}>{rewrites ? `書き直し ${attempt.rounds.length - 1}回目` : "総合評価"}</p>
          <p style={{ fontSize: 40, fontWeight: 800, color: scoreColor(r.total, 16), fontVariantNumeric: "tabular-nums" }}>
            {r.total}<span style={{ fontSize: 20, color: C.sub }}> / 16点</span>
          </p>
          {rewrites && (
            <p style={{ color: r.total >= first.result.total ? C.good : C.warn, fontSize: 15, fontWeight: 700 }}>
              最初 {first.result.total}点 → 今回 {r.total}点（{r.total - first.result.total >= 0 ? "+" : ""}{r.total - first.result.total}）
            </p>
          )}
          <p style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{r.wordCount}語 ・ AIによる参考評価です（英検のCSEスコアとは別のものです）</p>
        </Card>

        <Card>
          <CardTitle>観点別評価</CardTitle>
          {CRITERIA.map((c) => (
            <div key={c} style={{ display: "grid", gridTemplateColumns: "48px 1fr 76px", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ color: C.text, fontSize: 15 }}>{CRITERION_LABEL[c]}</span>
              <Bar value={r.scores[c]} max={4} color={scoreColor(r.scores[c], 4)} />
              <span style={{ color: C.text, fontSize: 15, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {rewrites ? `${first.result.scores[c]}→` : ""}{r.scores[c]}点
              </span>
            </div>
          ))}
        </Card>

        <Card>
          <CardTitle>👍 良かったところ</CardTitle>
          <p style={{ color: C.text, fontSize: 15, lineHeight: 1.7 }}>{r.goodPoints}</p>
        </Card>

        {r.improvements.length > 0 && (
          <Card>
            <CardTitle>🔧 改善ポイント</CardTitle>
            {r.improvements.map((t, i) => (
              <p key={i} style={{ color: C.text, fontSize: 15, lineHeight: 1.7, marginBottom: 6 }}>
                <b style={{ color: C.warn }}>{i + 1}.</b> {t}
              </p>
            ))}
          </Card>
        )}

        <Card>
          <CardTitle>✏️ 文法添削</CardTitle>
          {r.corrections.length === 0 ? (
            <p style={{ color: C.good, fontSize: 15 }}>大きな文法の間違いはありませんでした。</p>
          ) : r.corrections.map((c, i) => (
            <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? `1px dashed ${C.border}` : "none" }}>
              <p style={{ fontSize: 13, color: C.muted }}>修正前</p>
              <p style={{ color: "#fca5a5", fontSize: 15, textDecoration: "line-through", textDecorationColor: "#ef444488" }}>{c.before}</p>
              <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>修正後</p>
              <p style={{ color: "#6ee7b7", fontSize: 15, fontWeight: 600 }}>{c.after}</p>
              <p style={{ color: C.sub, fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>
                <Pill color={C.warn}>{TAG_LABEL[c.tag]}</Pill> {c.explain}
              </p>
            </div>
          ))}
        </Card>

        <Card>
          <CardTitle>📝 直した英文</CardTitle>
          <p style={{ color: C.text, fontSize: 15, lineHeight: 1.8 }}>{r.correctedEssay}</p>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ color: C.sub, fontSize: 14, fontWeight: 700 }}>⭐ 模範解答</p>
            <div style={{ display: "flex", gap: 6 }}>
              <SmallBtn onClick={() => speak(r.modelAnswer)}>🔊</SmallBtn>
              <SmallBtn onClick={() => setShowModelJp((v) => !v)}>{showModelJp ? "訳を隠す" : "日本語訳"}</SmallBtn>
            </div>
          </div>
          <p style={{ color: C.text, fontSize: 15, lineHeight: 1.8 }}>{r.modelAnswer}</p>
          {showModelJp && question.modelJp && r.modelAnswer === question.modelAnswer && (
            <p style={{ color: C.sub, fontSize: 14, marginTop: 8, lineHeight: 1.7 }}>{question.modelJp}</p>
          )}
          {showModelJp && r.modelAnswer !== question.modelAnswer && (
            <>
              <p style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>問題集の模範解答と日本語訳：</p>
              <p style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>{question.modelAnswer}</p>
              <p style={{ color: C.sub, fontSize: 14, marginTop: 4, lineHeight: 1.7 }}>{question.modelJp}</p>
            </>
          )}
        </Card>

        {rewrites && (
          <Card>
            <CardTitle>📈 書き直しの記録</CardTitle>
            {attempt.rounds.map((rd, i) => (
              <div key={rd.gradedAt} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: C.text, fontSize: 14 }}>
                <span>{i === 0 ? "1回目" : `書き直し${i}`}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {CRITERIA.map((c) => rd.result.scores[c]).join(" / ")} ＝ <b>{rd.result.total}点</b>
                </span>
              </div>
            ))}
            <p style={{ color: C.muted, fontSize: 12 }}>内容 / 構成 / 語彙 / 文法</p>
          </Card>
        )}

        <Btn onClick={onRewrite}>🔁 同じ問題で書き直す</Btn>
        <Btn kind="secondary" onClick={onBack}>戻る</Btn>
      </main>
    </div>
  );
}

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.sub,
               fontSize: 13, padding: "6px 10px", cursor: "pointer", minHeight: 36 }}>
      {children}
    </button>
  );
}

function Toggle({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ flex: 1, minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
               background: on ? "rgba(101,163,10,0.18)" : C.card, color: on ? C.accent : C.sub,
               border: `1px solid ${on ? C.accent2 : C.border}` }}>
      {children}
    </button>
  );
}
