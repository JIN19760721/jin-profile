"use client";
import type { Analysis } from "../../lib/eiken/analysis";
import type { DailyPlan } from "../../lib/eiken/curriculum";
import { CRITERION_LABEL, TAG_LABEL, type EikenProfile } from "../../lib/eiken/types";
import { Bar, Btn, C, Card, CardTitle, Pill } from "./ui";

interface Props {
  profile:    EikenProfile;
  plan:       DailyPlan;
  analysis:   Analysis;
  doneSteps:  string[];
  streak:     number;
  weekDays:   number;
  writingAvg: number | null;
  onStart:    () => void;
  onProfile:  () => void;
}

export default function EikenHome({ profile, plan, analysis, doneSteps, streak, weekDays, writingAvg, onStart, onProfile }: Props) {
  const total = profile.cse.reading + profile.cse.listening + profile.cse.writing;
  const gap = profile.passLine - total;
  const allDone = plan.steps.every((s) => doneSteps.includes(s.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,#166534,#4d7c0f)", borderRadius: 20, padding: 18, color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ color: "#d9f99d", fontSize: 13 }}>{profile.targetExam} 一次試験まで</p>
            <p style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {plan.daysLeft >= 0 ? `あと${plan.daysLeft}日` : "試験日を設定"}
            </p>
            <p style={{ color: "#d9f99d", fontSize: 12 }}>{profile.examDate.replace(/-/g, "/")}（プロフィールで変更できます）</p>
          </div>
          <button onClick={onProfile}
            style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, color: "#fff",
                     padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40 }}>
            👤 プロフィール
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
          {[
            { v: `${streak}日`, l: "連続学習" },
            { v: `${weekDays}日`, l: "今週の学習" },
            { v: writingAvg !== null ? `${writingAvg}点` : "−", l: "ライティング平均" },
          ].map(({ v, l }) => (
            <div key={l} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 11, color: "#d9f99d" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ color: C.sub, fontSize: 14, fontWeight: 700 }}>📅 今日の学習メニュー（{profile.dailyMinutes}分）</p>
          <Pill>第{plan.stage.no}段階</Pill>
        </div>
        <p style={{ color: C.text, fontSize: 14, marginBottom: 8 }}>{plan.stage.title}</p>
        {plan.steps.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 18 }}>{doneSteps.includes(s.key) ? "✅" : "⬜"}</span>
            <span style={{ flex: 1, color: C.text, fontSize: 15 }}>{s.title}</span>
            <span style={{ color: C.muted, fontSize: 13 }}>{s.minutes}分</span>
          </div>
        ))}
        {plan.note && <p style={{ color: C.sub, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{plan.note}</p>}
        <div style={{ marginTop: 12 }}>
          <Btn onClick={onStart}>{allDone ? "🎉 今日のメニューは完了！もう一度見る" : doneSteps.length > 0 ? "▶ 続きから学習する" : "▶ 学習を始める"}</Btn>
        </div>
      </Card>

      <Card>
        <CardTitle>📊 4観点の習熟度（AI採点・直近の結果を重視）</CardTitle>
        {analysis.mastery.map((m) => (
          <div key={m.criterion} style={{ display: "grid", gridTemplateColumns: "48px 1fr 64px", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <span style={{ color: C.text, fontSize: 15 }}>{CRITERION_LABEL[m.criterion]}</span>
            <Bar value={m.average ?? 0} max={4} />
            <span style={{ color: m.average === null ? C.muted : C.text, fontSize: 14, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {m.average === null ? "−" : `${m.average} / 4`}
            </span>
          </div>
        ))}
        {analysis.essays < 3 && (
          <p style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>英作文を3本以上書くと表示されます（今 {analysis.essays}本）。</p>
        )}
      </Card>

      <Card>
        <CardTitle>💪 苦手分野</CardTitle>
        {analysis.weak.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {analysis.weak.map((t) => <Pill key={t.tag} color={C.warn}>{TAG_LABEL[t.tag]}</Pill>)}
          </div>
        ) : analysis.tentative.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {analysis.tentative.map((t) => <Pill key={t.tag} color={C.muted}>{TAG_LABEL[t.tag]}？</Pill>)}
          </div>
        ) : null}
        <p style={{ color: C.sub, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{analysis.message}</p>
      </Card>

      <Card>
        <CardTitle>🎯 合格目標（初期診断）</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 10 }}>
          {[
            { l: "Reading", v: profile.cse.reading },
            { l: "Listening", v: profile.cse.listening },
            { l: "Writing", v: profile.cse.writing },
          ].map((x) => (
            <div key={x.l} style={{ background: C.bg, borderRadius: 10, padding: "8px 0", textAlign: "center" }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>{x.v}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{x.l}</div>
            </div>
          ))}
        </div>
        <p style={{ color: C.text, fontSize: 15 }}>
          合計 <b>{total}</b> ／ 合格基準 <b>{profile.passLine}</b>
          {gap > 0 ? <>（あと <b style={{ color: C.warn }}>{gap}</b>）</> : <>（<b style={{ color: C.good }}>基準を超えています</b>）</>}
        </p>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
          前回の英検の結果です。アプリの練習問題の点数から、CSEスコアは計算しません。
        </p>
      </Card>
    </div>
  );
}
