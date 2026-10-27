"use client";
// 学習ダッシュボード用の小さなSVGグラフ（タップで値を表示・表でも見られる）
// 配色はカード背景 #1e293b で検証済み（青 #3987e5 / オレンジ #d95926）

import { useState, type ReactNode } from "react";
import { C } from "./ui";

export const SERIES = { primary: "#3987e5", secondary: "#d95926" };
const GRID = "#334155";
const W = 320;

function Frame({ title, note, table, children }: { title: string; note?: string; table: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ color: C.sub, fontSize: 14, fontWeight: 700 }}>{title}</p>
        <button onClick={() => setAsTable((v) => !v)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.sub,
                   fontSize: 12, padding: "4px 8px", cursor: "pointer", minHeight: 32 }}>
          {asTable ? "グラフ" : "表"}
        </button>
      </div>
      {asTable ? table : children}
      {note && <p style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{note}</p>}
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: C.text }}>
      <thead>
        <tr>{head.map((h) => <th key={h} style={{ textAlign: "left", color: C.muted, fontWeight: 600, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: "4px 0", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" }}>{v}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>{text}</p>
);

/** 得点推移（折れ線・1系列） */
export function ScoreLine({ points, max, title, unit }: { points: { label: string; value: number }[]; max: number; title: string; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const H = 150, padL = 26, padR = 12, padT = 12, padB = 22;
  const x = (i: number) => padL + (points.length <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const ticks = [0, max / 2, max];
  const a = active ?? points.length - 1;
  return (
    <Frame title={title} table={<SimpleTable head={["日付", unit]} rows={points.map((p) => [p.label, p.value])} />}>
      {points.length === 0 ? <Empty text="まだ記録がありません" /> : (
        <>
          <p style={{ color: C.text, fontSize: 13, minHeight: 18 }}>{points[a].label}：<b>{points[a].value}{unit}</b></p>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", touchAction: "pan-y" }} role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={padL - 6} y={y(t) + 4} fill={C.muted} fontSize={10} textAnchor="end">{t}</text>
              </g>
            ))}
            <path d={points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ")}
              fill="none" stroke={SERIES.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <line x1={x(a)} x2={x(a)} y1={padT} y2={H - padB} stroke={C.muted} strokeWidth={1} />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={x(i)} cy={y(p.value)} r={i === a ? 6 : 4} fill={SERIES.primary} stroke={C.card} strokeWidth={2} />
                <rect x={x(i) - 14} y={padT} width={28} height={H - padT - padB} fill="transparent"
                  onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
              </g>
            ))}
            {points.length > 1 && [0, points.length - 1].map((i) => (
              <text key={i} x={x(i)} y={H - 6} fill={C.muted} fontSize={10} textAnchor={i === 0 ? "start" : "end"}>{points[i].label}</text>
            ))}
          </svg>
        </>
      )}
    </Frame>
  );
}

/** 縦棒（1系列） */
export function Columns({ bars, max, title, unit, note }: { bars: { label: string; value: number }[]; max: number; title: string; unit: string; note?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const H = 150, padL = 26, padR = 8, padT = 12, padB = 22;
  const slot = (W - padL - padR) / Math.max(1, bars.length);
  const bw = Math.min(24, slot - 2);
  const top = Math.max(max, 1);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const base = H - padB;
  const a = active;
  return (
    <Frame title={title} note={note} table={<SimpleTable head={["", unit]} rows={bars.map((b) => [b.label, b.value])} />}>
      <p style={{ color: C.text, fontSize: 13, minHeight: 18 }}>{a !== null ? <>{bars[a].label}：<b>{bars[a].value}{unit}</b></> : "棒をタップすると値が出ます"}</p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", touchAction: "pan-y" }} role="img" aria-label={title}>
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} fill={C.muted} fontSize={10} textAnchor="end">{Math.round(t * 10) / 10}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = Math.max(0, base - y(b.value));
          const r = Math.min(4, h);
          return (
            <g key={i} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {h > 0 && (
                <path fill={SERIES.primary} opacity={a === null || a === i ? 1 : 0.6}
                  d={`M${cx - bw / 2},${base} V${base - h + r} Q${cx - bw / 2},${base - h} ${cx - bw / 2 + r},${base - h} H${cx + bw / 2 - r} Q${cx + bw / 2},${base - h} ${cx + bw / 2},${base - h + r} V${base} Z`} />
              )}
              {(bars.length <= 6 || i === 0 || i === bars.length - 1) && (
                <text x={cx} y={H - 6} fill={C.muted} fontSize={10} textAnchor="middle">{b.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

/** 2つの時期の比較（横棒・2系列） */
export function PairBars({ rows, title, labels, note }: {
  rows: { label: string; a: number; b: number }[]; title: string; labels: [string, string]; note?: string;
}) {
  return (
    <Frame title={title} note={note}
      table={<SimpleTable head={["分野", labels[0], labels[1]]} rows={rows.map((r) => [r.label, `${Math.round(r.a * 100)}%`, `${Math.round(r.b * 100)}%`])} />}>
      {rows.length === 0 ? <Empty text="比べるにはもう少し記録が必要です" /> : (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
            {[SERIES.secondary, SERIES.primary].map((col, i) => (
              <span key={col} style={{ display: "flex", alignItems: "center", gap: 6, color: C.sub, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: col }} />{labels[i]}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.label} style={{ marginBottom: 10 }}>
              <p style={{ color: C.text, fontSize: 13, marginBottom: 4 }}>
                {r.label} <span style={{ color: C.muted }}>{Math.round(r.a * 100)}% → {Math.round(r.b * 100)}%</span>
              </p>
              {[{ v: r.a, col: SERIES.secondary }, { v: r.b, col: SERIES.primary }].map((s, i) => (
                <div key={i} style={{ height: 8, marginBottom: 2 }}>
                  <div style={{ width: `${Math.max(2, s.v * 100)}%`, height: "100%", background: s.col, borderRadius: "0 4px 4px 0" }} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </Frame>
  );
}
