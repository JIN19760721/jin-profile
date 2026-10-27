"use client";
import type { Analysis } from "../../lib/eiken/analysis";
import { minutesByDay, scoreTrend } from "../../lib/eiken/stats";
import { CRITERION_LABEL, TAG_LABEL, type DrillRecord, type StudyMinutes, type WritingAttempt } from "../../lib/eiken/types";
import { Columns, PairBars, ScoreLine } from "./charts";
import { C, Card, CardTitle, scoreColor } from "./ui";

export default function HistoryView({ attempts, drills, studySec, studyDayCount, analysis, today, onOpenAttempt }: {
  attempts: WritingAttempt[];
  drills: DrillRecord[];
  studySec: StudyMinutes;
  studyDayCount: number;
  analysis: Analysis;
  today: string;
  onOpenAttempt: (a: WritingAttempt) => void;
}) {
  const trend = scoreTrend(attempts, 10);
  const totalMin = Math.round(Object.values(studySec).reduce((s, v) => s + v, 0) / 60);
  const answered = drills.length + attempts.reduce((s, a) => s + a.rounds.length, 0);
  const avg = trend.length ? Math.round((trend.reduce((s, t) => s + t.total, 0) / trend.length) * 10) / 10 : null;
  const improvement = analysis.tags
    .filter((t) => t.older !== undefined && t.recent !== undefined && (t.older > 0 || t.recent > 0))
    .slice(0, 6)
    .map((t) => ({ label: TAG_LABEL[t.tag], a: t.older!, b: t.recent! }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
        {[
          { v: `${studyDayCount}日`, l: "学習日数" },
          { v: `${totalMin}分`, l: "総学習時間（英作文・ドリル）" },
          { v: `${answered}問`, l: "解答した問題" },
          { v: avg !== null ? `${avg}点` : "−", l: "ライティング平均（直近10回）" },
        ].map((x) => (
          <Card key={x.l} style={{ padding: 12, textAlign: "center" }}>
            <p style={{ color: C.text, fontSize: 22, fontWeight: 800 }}>{x.v}</p>
            <p style={{ color: C.muted, fontSize: 11 }}>{x.l}</p>
          </Card>
        ))}
      </div>

      <ScoreLine title="ライティング得点の推移（直近10回・1回目の点数）" unit="点" max={16}
        points={trend.map((t) => ({ label: t.date, value: t.total }))} />

      <Columns title="4観点の得点（直近の結果を重視した平均）" unit="点" max={4}
        note={analysis.essays < 3 ? `英作文を3本以上書くと表示されます（今${analysis.essays}本）` : undefined}
        bars={analysis.mastery.map((m) => ({ label: CRITERION_LABEL[m.criterion], value: m.average ?? 0 }))} />

      <Columns title="学習時間の推移（直近14日）" unit="分" max={Math.max(15, ...minutesByDay(studySec, today).map((d) => d.value))}
        bars={minutesByDay(studySec, today)} />

      <PairBars title="苦手分野の改善状況（ミスの割合）" labels={["前半", "最近"]} rows={improvement}
        note="記録を前半と最近に分けて比べています。最近のほうが短ければ改善しています。" />

      <Card>
        <CardTitle>📝 英作文の履歴</CardTitle>
        {attempts.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13 }}>まだ英作文の記録がありません。</p>
        ) : [...attempts].reverse().slice(0, 50).map((a, i) => {
          const last = a.rounds.at(-1)!;
          return (
            <button key={a.id} onClick={() => onOpenAttempt(a)}
              style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none",
                       borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "10px 0", cursor: "pointer", minHeight: 52 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: C.muted, fontSize: 12 }}>
                  {new Date(a.createdAt).toLocaleDateString("ja-JP")}{a.rounds.length > 1 ? ` ・ 書き直し${a.rounds.length - 1}回` : ""}
                </p>
                <p style={{ color: C.text, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.questionText}</p>
              </div>
              <span style={{ color: scoreColor(last.result.total, 16), fontWeight: 700, fontSize: 15 }}>
                {a.rounds.length > 1 ? `${a.rounds[0].result.total}→` : ""}{last.result.total}点
              </span>
            </button>
          );
        })}
      </Card>
    </div>
  );
}
