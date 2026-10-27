"use client";
import { WRITING_QUESTIONS } from "../../data/eikenWriting";
import type { WritingAttempt, WritingQuestion } from "../../lib/eiken/types";
import { C, Card, CardTitle, Pill, scoreColor } from "./ui";

export default function WritingList({ attempts, aiQuestions, draftIds, onOpen, onTimed }: {
  attempts: WritingAttempt[];
  aiQuestions: WritingQuestion[];
  draftIds: string[];
  onOpen: (q: WritingQuestion) => void;
  onTimed: () => void;
}) {
  const best = (id: string) => {
    const list = attempts.filter((a) => a.questionId === id);
    if (list.length === 0) return null;
    return Math.max(...list.flatMap((a) => a.rounds.map((r) => r.result.total)));
  };

  const row = (q: WritingQuestion, i: number) => {
    const b = best(q.id);
    return (
      <button key={q.id} onClick={() => onOpen(q)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                 background: "none", border: "none", borderTop: i > 0 ? `1px solid ${C.border}` : "none",
                 padding: "12px 0", cursor: "pointer", minHeight: 56 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.sub, fontSize: 12 }}>{q.topic}{draftIds.includes(q.id) ? " ・ ✏️ 書きかけ" : ""}</p>
          <p style={{ color: C.text, fontSize: 15, lineHeight: 1.5 }}>{q.question}</p>
        </div>
        <span style={{ color: b === null ? C.muted : scoreColor(b, 16), fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
          {b === null ? "未" : `${b}点`}
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <p style={{ color: C.text, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>✍️ ライティング練習（意見論述）</p>
        <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.6 }}>
          QUESTION に対して、意見と理由を2つ、50〜60語で書きます。書いたらAIが4つの観点で採点・添削します。
        </p>
        <button onClick={onTimed}
          style={{ marginTop: 12, width: "100%", minHeight: 48, borderRadius: 12, border: `1px solid ${C.accent2}`,
                   background: "rgba(101,163,10,0.12)", color: C.accent, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          ⏱ 本番形式（20分）で1問書く
        </button>
      </Card>

      {aiQuestions.length > 0 && (
        <Card>
          <CardTitle>🤖 あなた向けにAIが作った問題 <Pill color={C.sub}>{aiQuestions.length}</Pill></CardTitle>
          {[...aiQuestions].reverse().map(row)}
        </Card>
      )}

      <Card>
        <CardTitle>📚 問題集（{WRITING_QUESTIONS.length}問）</CardTitle>
        {WRITING_QUESTIONS.map(row)}
      </Card>
    </div>
  );
}
