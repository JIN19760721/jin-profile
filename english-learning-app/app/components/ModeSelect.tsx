"use client";

type AppMode = "eikaiwa" | "toeic";

interface Props {
  onSelect: (mode: AppMode) => void;
}

export default function ModeSelect({ onSelect }: Props) {
  return (
    <div style={{
      minHeight: "100svh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg,#0f172a 0%,#1e1b4b 100%)",
      padding: "24px 20px",
    }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🇬🇧</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#e2e8f0", marginBottom: 6 }}>
          英会話マスター
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>
          モードを選択してください
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 380 }}>
        {/* 英会話モード */}
        <button onClick={() => onSelect("eikaiwa")}
          style={{
            background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
            border: "none", borderRadius: 20, padding: "28px 24px",
            cursor: "pointer", textAlign: "left", color: "#fff",
            boxShadow: "0 8px 32px rgba(79,70,229,0.4)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 40 }}>🗣️</span>
            <div>
              <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>英会話モード</p>
              <p style={{ fontSize: 13, color: "#c7d2fe", lineHeight: 1.5 }}>
                中学・高校レベルの単語とフレーズで<br />
                日常英会話を身につける
              </p>
            </div>
          </div>
          <div style={{
            display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap",
          }}>
            {["📖 フラッシュカード", "💬 フレーズ集", "🎯 単語クイズ"].map((t) => (
              <span key={t} style={{
                background: "rgba(255,255,255,0.15)", borderRadius: 99,
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
              }}>{t}</span>
            ))}
          </div>
        </button>

        {/* TOEICモード */}
        <button onClick={() => onSelect("toeic")}
          style={{
            background: "linear-gradient(135deg,#0f766e,#0284c7)",
            border: "none", borderRadius: 20, padding: "28px 24px",
            cursor: "pointer", textAlign: "left", color: "#fff",
            boxShadow: "0 8px 32px rgba(15,118,110,0.4)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 40 }}>📊</span>
            <div>
              <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>TOEIC対策モード</p>
              <p style={{ fontSize: 13, color: "#a5f3fc", lineHeight: 1.5 }}>
                TOEIC 600〜860点レベルの単語と<br />
                Part別対策で高スコアを目指す
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {["📚 単語学習", "📝 Part1〜7", "🎯 模試", "📈 弱点分析"].map((t) => (
              <span key={t} style={{
                background: "rgba(255,255,255,0.15)", borderRadius: 99,
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
              }}>{t}</span>
            ))}
          </div>
        </button>
      </div>

      <p style={{ color: "#475569", fontSize: 12, marginTop: 32, textAlign: "center" }}>
        復習リスト・学習履歴は両モードで共有されます
      </p>
    </div>
  );
}
