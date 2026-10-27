"use client";
import type { DailyPlan, DailyStep } from "../../lib/eiken/curriculum";
import { STAGES } from "../../lib/eiken/curriculum";
import { Btn, C, Card, CardTitle, Pill } from "./ui";

export default function TodayView({ plan, doneSteps, hasDraft, hasResult, onRun }: {
  plan: DailyPlan; doneSteps: string[]; hasDraft: boolean; hasResult: boolean; onRun: (step: DailyStep["key"]) => void;
}) {
  const nextStep = plan.steps.find((s) => !doneSteps.includes(s.key));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <p style={{ color: C.text, fontSize: 17, fontWeight: 700 }}>⏱ 今日の15分学習</p>
          <Pill>第{plan.stage.no}段階：{plan.stage.title}</Pill>
        </div>
        {plan.note && <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.6 }}>{plan.note}</p>}
      </Card>

      {plan.steps.map((s, i) => {
        const done = doneSteps.includes(s.key);
        const isNext = nextStep?.key === s.key;
        const disabled = s.key === "check" && !hasResult;
        return (
          <Card key={s.key} style={{ borderColor: isNext ? C.accent2 : C.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{done ? "✅" : `${i + 1}`}</span>
              <p style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: 700 }}>{s.title}</p>
              <span style={{ color: C.muted, fontSize: 13 }}>{s.minutes}分</span>
            </div>
            <p style={{ color: C.sub, fontSize: 14, marginBottom: 10 }}>
              {s.detail}{s.key === "writing" && hasDraft ? "（書きかけの英文から再開します）" : ""}
            </p>
            <Btn kind={isNext ? "primary" : "secondary"} disabled={disabled} onClick={() => onRun(s.key)}>
              {disabled ? "先にライティングを採点しましょう" : done ? "もう一度やる" : "始める"}
            </Btn>
          </Card>
        );
      })}

      <Card>
        <CardTitle>🗺 学習ステージ</CardTitle>
        {STAGES.map((st) => (
          <div key={st.no} style={{ display: "flex", gap: 10, padding: "6px 0", opacity: st.no > plan.stage.no ? 0.5 : 1 }}>
            <span style={{ color: st.no === plan.stage.no ? C.accent : st.no < plan.stage.no ? C.good : C.muted, fontWeight: 700, width: 22 }}>
              {st.no < plan.stage.no ? "✓" : st.no}
            </span>
            <div>
              <p style={{ color: C.text, fontSize: 14, fontWeight: st.no === plan.stage.no ? 700 : 400 }}>{st.title}</p>
              {st.no === plan.stage.no && <p style={{ color: C.muted, fontSize: 12 }}>次に進む条件：{st.goal}</p>}
            </div>
          </div>
        ))}
        <p style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>時間が足りなくても大丈夫です。書きかけの英文は保存され、翌日に続きから再開できます。</p>
      </Card>
    </div>
  );
}
