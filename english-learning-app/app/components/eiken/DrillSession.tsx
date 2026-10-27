"use client";
// 基本文法（4択）・並べ替え・添削の復習を1問ずつ解く画面

import { useMemo, useState } from "react";
import { TAG_LABEL, type GrammarDrill, type ReorderDrill, type ReviewCard } from "../../lib/eiken/types";
import { recordDrill, recordWritingReview } from "./actions";
import { Btn, C, Card, Pill, SubHeader } from "./ui";

/** 1問分（どの種類の問題か） */
export type DrillItem =
  | { type: "grammar"; drill: GrammarDrill; reviewCardId?: string }
  | { type: "reorder"; drill: ReorderDrill; reviewCardId?: string }
  | { type: "fix"; card: ReviewCard; before: string; after: string; explain: string };

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function DrillSession({ title, items, onBack, onFinish }: {
  title: string; items: DrillItem[]; onBack: () => void; onFinish?: (correct: number, total: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const item = items[index];

  const handleAnswer = (correct: boolean) => {
    if (answered !== null) return;
    setAnswered(correct);
    if (correct) setCorrectCount((c) => c + 1);
    if (item.type === "fix") recordWritingReview(item.card.id, correct);
    else recordDrill(item.drill, correct, item.reviewCardId);
  };

  const next = () => {
    if (index + 1 >= items.length) {
      setFinished(true);
      onFinish?.(correctCount, items.length);
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(null);
  };

  if (items.length === 0) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <SubHeader title={title} onBack={onBack} />
        <main style={{ padding: 16 }}><Card><p style={{ color: C.sub }}>今は解く問題がありません。</p></Card></main>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
      <SubHeader title={title} onBack={onBack}
        right={<span style={{ color: C.accent, fontSize: 14, fontWeight: 700 }}>{Math.min(index + 1, items.length)} / {items.length}</span>} />
      <main style={{ padding: "16px 16px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
        {finished ? (
          <Card style={{ textAlign: "center" }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: C.text }}>おつかれさまでした！</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: C.accent, margin: "10px 0" }}>{correctCount} / {items.length}問 正解</p>
            <p style={{ color: C.sub, fontSize: 14 }}>間違えた問題は、翌日・3日後・7日後・14日後に復習として出てきます。</p>
            <div style={{ marginTop: 16 }}><Btn onClick={onBack}>戻る</Btn></div>
          </Card>
        ) : (
          <>
            {item.type === "grammar" && <GrammarCard key={index} drill={item.drill} answered={answered} onAnswer={handleAnswer} />}
            {item.type === "reorder" && <ReorderCard key={index} drill={item.drill} answered={answered} onAnswer={handleAnswer} />}
            {item.type === "fix" && <FixCard key={index} item={item} answered={answered} onAnswer={handleAnswer} />}
            {answered !== null && <Btn onClick={next}>{index + 1 >= items.length ? "結果を見る" : "次へ"}</Btn>}
          </>
        )}
      </main>
    </div>
  );
}

function Feedback({ correct, explain }: { correct: boolean; explain: string }) {
  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 12,
                  background: correct ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                  border: `1px solid ${correct ? C.good : C.bad}` }}>
      <p style={{ color: correct ? "#6ee7b7" : "#fca5a5", fontWeight: 700, fontSize: 16 }}>{correct ? "⭕ 正解！" : "❌ おしい！"}</p>
      <p style={{ color: C.text, fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>{explain}</p>
    </div>
  );
}

function OptionButton({ label, state, onClick }: { label: string; state: "idle" | "right" | "wrong" | "dim"; onClick: () => void }) {
  const styles = {
    idle:  { bg: C.bg, border: C.border, color: C.text },
    right: { bg: "rgba(16,185,129,0.12)", border: C.good, color: "#6ee7b7" },
    wrong: { bg: "rgba(239,68,68,0.12)", border: C.bad, color: "#fca5a5" },
    dim:   { bg: C.bg, border: C.border, color: C.muted },
  }[state];
  return (
    <button onClick={onClick}
      style={{ textAlign: "left", minHeight: 52, padding: "12px 14px", borderRadius: 12, fontSize: 16,
               background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color, cursor: "pointer" }}>
      {label}
    </button>
  );
}

function GrammarCard({ drill, answered, onAnswer }: { drill: GrammarDrill; answered: boolean | null; onAnswer: (c: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <Card>
      <div style={{ marginBottom: 10 }}><Pill>{TAG_LABEL[drill.tag]}</Pill></div>
      {drill.prompt && <p style={{ color: C.text, fontSize: 18, lineHeight: 1.6, marginBottom: 6 }}>{drill.prompt.replace("____", "（　　）")}</p>}
      <p style={{ color: C.sub, fontSize: 14, marginBottom: 12 }}>{drill.promptJp}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {drill.options.map((o, i) => (
          <OptionButton key={i} label={o}
            state={answered === null ? "idle" : i === drill.answer ? "right" : i === picked ? "wrong" : "dim"}
            onClick={() => { if (answered === null) { setPicked(i); onAnswer(i === drill.answer); } }} />
        ))}
      </div>
      {answered !== null && <Feedback correct={answered} explain={drill.explain} />}
    </Card>
  );
}

function ReorderCard({ drill, answered, onAnswer }: { drill: ReorderDrill; answered: boolean | null; onAnswer: (c: boolean) => void }) {
  const pool = useMemo(() => {
    const idx = drill.chunks.map((_, i) => i);
    let s = shuffle(idx);
    // 最初から正しい順番にならないようにする
    if (s.every((v, i) => v === i) && s.length > 1) s = [...s.slice(1), s[0]];
    return s;
  }, [drill]);
  const [chosen, setChosen] = useState<number[]>([]);
  const remaining = pool.filter((i) => !chosen.includes(i));
  const done = chosen.length === drill.chunks.length;

  const check = () => onAnswer(chosen.every((v, i) => drill.chunks[v] === drill.chunks[i]));

  return (
    <Card>
      <div style={{ marginBottom: 10 }}><Pill>{TAG_LABEL[drill.tag]}</Pill></div>
      <p style={{ color: C.sub, fontSize: 14, marginBottom: 4 }}>日本語に合うように並べかえましょう</p>
      <p style={{ color: C.text, fontSize: 17, marginBottom: 12, fontWeight: 600 }}>{drill.jp}</p>
      <div style={{ minHeight: 60, background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 10,
                    display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {chosen.map((i, k) => (
          <button key={k} onClick={() => answered === null && setChosen((c) => c.filter((_, j) => j !== k))}
            style={{ background: "rgba(101,163,10,0.18)", border: `1px solid ${C.accent2}`, color: C.text,
                     borderRadius: 10, padding: "8px 10px", fontSize: 16, cursor: "pointer", minHeight: 44 }}>
            {drill.chunks[i]}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {remaining.map((i) => (
          <button key={i} onClick={() => answered === null && setChosen((c) => [...c, i])}
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text,
                     borderRadius: 10, padding: "8px 10px", fontSize: 16, cursor: "pointer", minHeight: 44 }}>
            {drill.chunks[i]}
          </button>
        ))}
      </div>
      {answered === null && done && <div style={{ marginTop: 12 }}><Btn onClick={check}>答え合わせ</Btn></div>}
      {answered !== null && (
        <Feedback correct={answered} explain={`${answered ? "" : `正解：${drill.chunks.join(" ")}　`}${drill.explain}`} />
      )}
    </Card>
  );
}

function FixCard({ item, answered, onAnswer }: {
  item: Extract<DrillItem, { type: "fix" }>; answered: boolean | null; onAnswer: (c: boolean) => void;
}) {
  const options = useMemo(() => shuffle([item.after, item.before]), [item]);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Card>
      <div style={{ marginBottom: 10 }}><Pill>{TAG_LABEL[item.card.tag]}</Pill> <Pill color={C.warn}>前に間違えたところ</Pill></div>
      <p style={{ color: C.text, fontSize: 16, marginBottom: 12 }}>正しい英文はどちらですか？</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((o) => (
          <OptionButton key={o} label={o}
            state={answered === null ? "idle" : o === item.after ? "right" : o === picked ? "wrong" : "dim"}
            onClick={() => { if (answered === null) { setPicked(o); onAnswer(o === item.after); } }} />
        ))}
      </div>
      {answered !== null && <Feedback correct={answered} explain={item.explain} />}
    </Card>
  );
}
