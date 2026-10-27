"use client";
import type { Analysis, TagStat } from "../../lib/eiken/analysis";
import { TAG_LABEL, type WeaknessTag } from "../../lib/eiken/types";
import { Bar, Btn, C, Card, CardTitle, Pill } from "./ui";

const TREND_LABEL: Record<TagStat["trend"], string> = {
  improving: "↗ 改善中", worse: "↘ 要注意", flat: "→ 変化なし", unknown: "",
};

/** 英作文の問題をAIで作るのに向いている弱点 */
const AI_TAGS: WeaknessTag[] = ["grammar", "vocabulary", "organization", "content", "off_topic", "few_reasons", "conjunction", "tense", "agreement", "article", "plural", "word_order", "word_count"];

export default function WeakView({ analysis, dueCount, generating, onReview, onDrill, onBasics, onAiQuestion }: {
  analysis: Analysis;
  dueCount: number;
  generating: boolean;
  onReview: () => void;
  onDrill: (tag: WeaknessTag) => void;
  onBasics: (kind: "grammar" | "reorder") => void;
  onAiQuestion: (tag: WeaknessTag | undefined) => void;
}) {
  const shown = analysis.tags.filter((t) => t.samples > 0).slice(0, 8);
  const top = analysis.weak[0]?.tag ?? analysis.tentative[0]?.tag;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <p style={{ color: C.text, fontSize: 17, fontWeight: 700, marginBottom: 6 }}>💪 苦手克服</p>
        <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.6 }}>{analysis.message}</p>
        <div style={{ marginTop: 12 }}>
          <Btn onClick={onReview} disabled={dueCount === 0}>
            {dueCount > 0 ? `🔁 今日の復習（${dueCount}問）` : "今日の復習はありません"}
          </Btn>
        </div>
      </Card>

      {shown.length > 0 && (
        <Card>
          <CardTitle>分野ごとのミスの割合（直近の結果を重視）</CardTitle>
          {shown.map((t) => (
            <div key={t.tag} style={{ padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: C.text, fontSize: 15 }}>
                  {TAG_LABEL[t.tag]} {!t.enough && <span style={{ color: C.muted, fontSize: 12 }}>（データ不足）</span>}
                </span>
                <span style={{ color: C.sub, fontSize: 13 }}>{TREND_LABEL[t.trend]} {Math.round(t.rate * 100)}%</span>
              </div>
              <Bar value={t.rate} max={1} color={t.rate >= 0.4 ? C.warn : C.good} />
              <button onClick={() => onDrill(t.tag)}
                style={{ marginTop: 8, background: "none", border: `1px solid ${C.border}`, borderRadius: 10,
                         color: C.accent, fontSize: 14, padding: "8px 12px", cursor: "pointer", minHeight: 40 }}>
                この分野の問題を解く
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <CardTitle>🤖 弱点に合わせた英作文（AI作成）</CardTitle>
        <p style={{ color: C.sub, fontSize: 14, marginBottom: 10, lineHeight: 1.6 }}>
          苦手な分野を練習しやすい新しい問題をAIが作ります（1日の利用回数にふくまれます）。作れなかったときは問題集から出題します。
        </p>
        {top && <div style={{ marginBottom: 8 }}><Pill color={C.warn}>おすすめ：{TAG_LABEL[top]}</Pill></div>}
        <Btn onClick={() => onAiQuestion(top && AI_TAGS.includes(top) ? top : undefined)} disabled={generating}>
          {generating ? "⏳ 問題を作っています…" : "新しい問題を作る"}
        </Btn>
      </Card>

      <Card>
        <CardTitle>📘 基礎問題</CardTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn kind="secondary" onClick={() => onBasics("grammar")}>基本文法（50問からランダムに10問）</Btn>
          <Btn kind="secondary" onClick={() => onBasics("reorder")}>英作文並べ替え（50問からランダムに10問）</Btn>
        </div>
      </Card>
    </div>
  );
}
