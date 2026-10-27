"use client";
// 英検ライティング画面の共通部品（既存の英検モードの配色に合わせる）

import type { CSSProperties, ReactNode } from "react";

export const C = {
  bg:      "#0f172a",
  card:    "#1e293b",
  border:  "#334155",
  text:    "#e2e8f0",
  sub:     "#94a3b8",
  muted:   "#64748b",
  accent:  "#84cc16",
  accent2: "#65a30d",
  good:    "#10b981",
  warn:    "#f59e0b",
  bad:     "#ef4444",
};

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, ...style }}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <p style={{ color: C.sub, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{children}</p>;
}

type BtnKind = "primary" | "secondary" | "ghost";

export function Btn({ children, onClick, kind = "primary", disabled, style }: {
  children: ReactNode; onClick?: () => void; kind?: BtnKind; disabled?: boolean; style?: CSSProperties;
}) {
  const base: CSSProperties = {
    width: "100%", minHeight: 52, borderRadius: 14, padding: "12px 16px",
    fontWeight: 700, fontSize: 16, cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1, border: "none",
  };
  const kinds: Record<BtnKind, CSSProperties> = {
    primary:   { background: "linear-gradient(135deg,#15803d,#65a30d)", color: "#fff" },
    secondary: { background: C.bg, border: `1px solid ${C.border}`, color: C.text },
    ghost:     { background: "transparent", color: C.sub, minHeight: 44, fontSize: 14 },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }}>
      {children}
    </button>
  );
}

export function Pill({ children, color = C.accent }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      display: "inline-block", background: `${color}22`, color, borderRadius: 99,
      padding: "3px 10px", fontSize: 12, fontWeight: 700,
    }}>{children}</span>
  );
}

/** 0〜max の横棒 */
export function Bar({ value, max, color = C.accent2 }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}

export function SubHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.card}`,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      padding: "10px 16px", paddingTop: "max(10px,env(safe-area-inset-top))",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <button onClick={onBack} aria-label="戻る"
          style={{ background: C.card, border: "none", borderRadius: 8, padding: "8px 12px",
                   color: C.sub, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>
          ‹
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
      </div>
      {right}
    </header>
  );
}

export const scoreColor = (v: number, max: number) => {
  const r = max > 0 ? v / max : 0;
  return r >= 0.75 ? C.good : r >= 0.5 ? C.warn : C.bad;
};
