"use client";
import { useMemo, useState } from "react";
import {
  EIKEN_SECTION1_PATTERNS,
  EIKEN_SECTION2_PATTERNS,
  EIKEN_SECTION3_PATTERNS,
} from "../data/eiken";
import type { StudyHistory, QuizRecord } from "../hooks/useStudyHistory";

type Phase = "home" | "test";
type SectionKey = "s1" | "s2" | "s3";

interface FlatQuestion {
  qid: string;
  section: SectionKey;
  num: number;
  prompt:
    | { kind: "vocab"; text: string }
    | { kind: "dialogue"; lines: { speaker: string; text: string }[] }
    | { kind: "reading"; text: string };
  options: string[];
  answer: number;
  explain: string;
}

interface ReadingPassageBlock {
  key: string;
  part: "A" | "B" | "C";
  title: string;
  passage: string[];
  firstNum: number;
}

const SECTION1_COUNT = 15;
const SECTION2_COUNT = 5;
const SECTION3_COUNT = 10;
const TOTAL = SECTION1_COUNT + SECTION2_COUNT + SECTION3_COUNT;

function randomPatternIdx() {
  return Math.floor(Math.random() * 10);
}

function buildTest(patternIdx: { s1: number; s2: number; s3: number }) {
  const flat: FlatQuestion[] = [];
  let num = 0;

  EIKEN_SECTION1_PATTERNS[patternIdx.s1].forEach((q, i) => {
    num += 1;
    flat.push({
      qid: `s1-${i}`, section: "s1", num,
      prompt: { kind: "vocab", text: q.text },
      options: q.options, answer: q.answer, explain: q.explain,
    });
  });

  EIKEN_SECTION2_PATTERNS[patternIdx.s2].forEach((q, i) => {
    num += 1;
    flat.push({
      qid: `s2-${i}`, section: "s2", num,
      prompt: { kind: "dialogue", lines: q.lines },
      options: q.options, answer: q.answer, explain: q.explain,
    });
  });

  const pattern3 = EIKEN_SECTION3_PATTERNS[patternIdx.s3];
  const passages: ReadingPassageBlock[] = [];
  (["A", "B", "C"] as const).forEach((partLabel) => {
    const part = partLabel === "A" ? pattern3.partA : partLabel === "B" ? pattern3.partB : pattern3.partC;
    const firstNum = num + 1;
    passages.push({ key: `s3-${partLabel}`, part: partLabel, title: part.title, passage: part.passage, firstNum });
    part.items.forEach((q, i) => {
      num += 1;
      flat.push({
        qid: `s3-${partLabel}-${i}`, section: "s3", num,
        prompt: { kind: "reading", text: q.text },
        options: q.options, answer: q.answer, explain: q.explain,
      });
    });
  });

  return { flat, passages };
}

interface Props {
  history:   StudyHistory;
  addRecord: (r: Omit<QuizRecord, "date">) => void;
  onBack:    () => void;
}

export default function EikenMode({ history, addRecord, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("home");
  const [patternIdx, setPatternIdx] = useState({ s1: 0, s2: 0, s3: 0 });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [graded, setGraded] = useState(false);

  const { flat, passages } = useMemo(() => buildTest(patternIdx), [patternIdx]);
  const answeredCount = Object.keys(answers).length;

  const eikenRecords = history.records.filter((r) => r.mode === "eiken");
  const last10 = eikenRecords.slice(-10).reverse();
  const avgPct = last10.length > 0
    ? Math.round(last10.reduce((s, r) => s + r.score / r.total, 0) / last10.length * 100)
    : null;

  const startTest = () => {
    setPatternIdx({ s1: randomPatternIdx(), s2: randomPatternIdx(), s3: randomPatternIdx() });
    setAnswers({});
    setGraded(false);
    setPhase("test");
  };

  const select = (qid: string, idx: number) => {
    if (graded) return;
    setAnswers((a) => ({ ...a, [qid]: idx }));
  };

  const scoreBySection: Record<SectionKey, { c: number; t: number }> = {
    s1: { c: 0, t: SECTION1_COUNT }, s2: { c: 0, t: SECTION2_COUNT }, s3: { c: 0, t: SECTION3_COUNT },
  };
  let totalCorrect = 0;
  if (graded) {
    flat.forEach((q) => {
      if (answers[q.qid] === q.answer) { totalCorrect += 1; scoreBySection[q.section].c += 1; }
    });
  }

  const grade = () => {
    let correct = 0;
    flat.forEach((q) => { if (answers[q.qid] === q.answer) correct += 1; });
    setGraded(true);
    addRecord({ mode: "eiken", level: "模試", score: correct, total: TOTAL });
  };

  if (phase === "home") {
    return (
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "max(10px,env(safe-area-inset-top)) 16px 12px",
        }}>
          <button onClick={onBack}
            style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px",
                     color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>
            ‹
          </button>
          <h1 style={{ fontSize: 17, fontWeight: 700 }}>🎓 英検準二級対策</h1>
        </header>

        <main style={{ padding: "8px 16px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "linear-gradient(135deg,#166534,#4d7c0f)", borderRadius: 20,
                        padding: 20, color: "#fff" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>英検準二級 模擬試験</h2>
            <p style={{ color: "#d9f99d", fontSize: 13, lineHeight: 1.6 }}>
              筆記の大問1〜3を再現した模擬試験です。大問ごとに10パターンの中からランダムに1つずつ選ばれるため、毎回違う組み合わせで出題されます。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
              {[
                { v: eikenRecords.length, l: "受験回数" },
                { v: avgPct !== null ? `${avgPct}%` : "−", l: "直近10回平均" },
                { v: history.streak, l: "連続学習日" },
              ].map(({ v, l }) => (
                <div key={l} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12,
                                      padding: "10px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: 10, color: "#d9f99d" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
            <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📝 出題構成</p>
            {[
              { label: "大問1：語彙・熟語空所補充", n: "15問" },
              { label: "大問2：会話文空所補充", n: "5問" },
              { label: "大問3：内容一致選択（掲示・Eメール・説明文）", n: "10問" },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between",
                                            padding: "8px 0", borderBottom: "1px solid #334155" }}>
                <span style={{ color: "#cbd5e1", fontSize: 13 }}>{row.label}</span>
                <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{row.n}</span>
              </div>
            ))}
            <p style={{ color: "#64748b", fontSize: 11, marginTop: 10 }}>
              全て出題形式に沿ったオリジナル問題です（英検協会の過去問ではありません）。
            </p>
          </div>

          <button onClick={startTest}
            style={{ background: "linear-gradient(135deg,#15803d,#65a30d)", border: "none",
                     borderRadius: 16, padding: "18px", color: "#fff",
                     fontWeight: 700, fontSize: 17, cursor: "pointer" }}>
            模試を開始する
          </button>

          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 16 }}>
            <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              📊 過去10回の模試結果
            </p>
            {last10.length === 0 ? (
              <p style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
                まだ模試の受験記録がありません
              </p>
            ) : (
              last10.map((r, i) => {
                const pct = Math.round(r.score / r.total * 100);
                const col = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10,
                                        padding: "8px 0", borderBottom: i < last10.length - 1 ? "1px solid #334155" : "none" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#cbd5e1", fontSize: 13 }}>{r.date}</p>
                      <div style={{ height: 5, background: "#334155", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3 }} />
                      </div>
                    </div>
                    <p style={{ color: col, fontWeight: 700, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
                      {r.score}/{r.total} ({pct}%)
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── 模試（テスト画面） ──────────────────────────────
  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", position: "relative" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#0f172a", borderBottom: "1px solid #1e293b",
        paddingTop: "max(10px,env(safe-area-inset-top))",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setPhase("home")}
              style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px",
                       color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>
              ‹
            </button>
            <h1 style={{ fontSize: 16, fontWeight: 700 }}>🎓 英検準二級 模擬試験</h1>
          </div>
          <span style={{ color: "#84cc16", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {answeredCount} / {TOTAL}
          </span>
        </div>
        <div style={{ height: 4, background: "#1e293b" }}>
          <div style={{ width: `${(answeredCount / TOTAL) * 100}%`, height: "100%",
                        background: "#65a30d", transition: "width 0.3s ease" }} />
        </div>
      </header>

      <main style={{ padding: "16px 16px 100px", display: "flex", flexDirection: "column", gap: 28 }}>

        <Daimon title="大問1" instruction="次の（　）に入れるのに最も適切なものを1, 2, 3, 4の中から一つ選びなさい。">
          {flat.filter((q) => q.section === "s1").map((q) => (
            <QCard key={q.qid} q={q} selected={answers[q.qid]} onSelect={select} graded={graded} />
          ))}
        </Daimon>

        <Daimon title="大問2" instruction="会話文を読み、（　）に入れるのに最も適切なものを1, 2, 3, 4の中から一つ選びなさい。">
          {flat.filter((q) => q.section === "s2").map((q) => (
            <QCard key={q.qid} q={q} selected={answers[q.qid]} onSelect={select} graded={graded} />
          ))}
        </Daimon>

        <Daimon title="大問3" instruction="次の英文の内容に関して、各設問に最も適切なものを1, 2, 3, 4の中から一つ選びなさい。">
          {passages.map((p) => (
            <div key={p.key}>
              <PassageBox p={p} />
              {flat.filter((q) => q.qid.startsWith(`s3-${p.part}-`)).map((q) => (
                <QCard key={q.qid} q={q} selected={answers[q.qid]} onSelect={select} graded={graded} />
              ))}
            </div>
          ))}
        </Daimon>

        {!graded ? (
          <button onClick={grade}
            style={{ position: "sticky", bottom: 16, background: "linear-gradient(135deg,#15803d,#65a30d)",
                     border: "none", borderRadius: 999, padding: "16px", color: "#fff",
                     fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            採点する
          </button>
        ) : (
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>採点結果</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { n: `${totalCorrect}/${TOTAL}`, l: "総合スコア" },
                { n: `${scoreBySection.s1.c}/${scoreBySection.s1.t}`, l: "大問1" },
                { n: `${scoreBySection.s2.c}/${scoreBySection.s2.t}`, l: "大問2" },
                { n: `${scoreBySection.s3.c}/${scoreBySection.s3.t}`, l: "大問3" },
              ].map((t) => (
                <div key={t.l} style={{ background: "#0f172a", borderRadius: 10, padding: "10px 4px", textAlign: "center" }}>
                  <div style={{ color: "#84cc16", fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{t.n}</div>
                  <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>{t.l}</div>
                </div>
              ))}
            </div>
            <button onClick={startTest}
              style={{ width: "100%", background: "#0f172a", border: "1px solid #334155",
                       borderRadius: 12, padding: "12px", color: "#e2e8f0",
                       fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              🔀 別のパターンでもう一度挑戦する
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Daimon({ title, instruction, children }: { title: string; instruction: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ borderBottom: "2px solid #4d7c0f", paddingBottom: 8, marginBottom: 6 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#84cc16", margin: 0 }}>{title}</h2>
      </div>
      <p style={{ color: "#64748b", fontSize: 12.5, margin: "6px 0 14px" }}>{instruction}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </section>
  );
}

function PassageBox({ p }: { p: ReadingPassageBlock }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #334155", borderLeft: "4px solid #4d7c0f",
                  borderRadius: "4px 12px 12px 4px", padding: "14px 16px", marginBottom: 12 }}>
      <p style={{ color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                  textTransform: "uppercase", marginBottom: 4 }}>Part {p.part}</p>
      <p style={{ color: "#84cc16", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{p.title}</p>
      {p.passage.map((para, i) => (
        <p key={i} style={{ color: "#cbd5e1", fontSize: 13.5, lineHeight: 1.7, marginBottom: 8 }}
          dangerouslySetInnerHTML={{ __html: para }} />
      ))}
    </div>
  );
}

function QCard({ q, selected, onSelect, graded }: {
  q: FlatQuestion;
  selected: number | undefined;
  onSelect: (qid: string, idx: number) => void;
  graded: boolean;
}) {
  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ marginBottom: 10 }}>
        <span style={{ color: "#84cc16", fontFamily: "ui-monospace,Consolas,monospace", fontWeight: 700,
                       fontSize: 12, marginRight: 6 }}>
          ({q.num})
        </span>
        {q.prompt.kind === "vocab" && (
          <span style={{ color: "#e2e8f0", fontSize: 14.5 }}
            dangerouslySetInnerHTML={{ __html: q.prompt.text.replace("____",
              '<span style="display:inline-block;min-width:56px;border-bottom:2px solid #64748b">&nbsp;</span>') }} />
        )}
        {q.prompt.kind === "reading" && (
          <span style={{ color: "#e2e8f0", fontSize: 14.5 }}>{q.prompt.text}</span>
        )}
        {q.prompt.kind === "dialogue" && (
          <div style={{ marginTop: 4 }}>
            {q.prompt.lines.map((line, i) => (
              <p key={i} style={{ color: "#e2e8f0", fontSize: 13.5, margin: "3px 0" }}>
                <span style={{ color: "#94a3b8", fontWeight: 600 }}>{line.speaker}: </span>
                <span dangerouslySetInnerHTML={{ __html: line.text.replace("____",
                  '<span style="display:inline-block;min-width:56px;border-bottom:2px solid #64748b">&nbsp;</span>') }} />
              </p>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {q.options.map((opt, idx) => {
          let bg = "#0f172a", border = "#334155", color = "#cbd5e1";
          if (graded) {
            if (idx === q.answer) { bg = "rgba(16,185,129,0.12)"; border = "#10b981"; color = "#6ee7b7"; }
            else if (idx === selected) { bg = "rgba(239,68,68,0.12)"; border = "#ef4444"; color = "#fca5a5"; }
            else { color = "#64748b"; }
          } else if (idx === selected) {
            bg = "rgba(101,163,10,0.15)"; border = "#65a30d"; color = "#e2e8f0";
          }
          return (
            <button key={idx} onClick={() => onSelect(q.qid, idx)} disabled={graded}
              style={{ display: "flex", gap: 8, textAlign: "left", padding: "8px 10px",
                       background: bg, border: `1px solid ${border}`, borderRadius: 10,
                       color, fontSize: 13, cursor: graded ? "default" : "pointer" }}>
              <span style={{ fontWeight: 700, color: "#64748b", flexShrink: 0 }}>{idx + 1}.</span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>

      {graded && (
        <p style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #334155",
                     color: "#94a3b8", fontSize: 12.5 }}>
          <b style={{ color: "#f59e0b" }}>解説：</b>{q.explain}
        </p>
      )}
    </div>
  );
}
