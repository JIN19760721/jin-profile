"use client";

type AppMode = "eikaiwa" | "toeic" | "eiken" | "summer" | "dictionary" | "ranking";

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
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🇬🇧</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#e2e8f0", marginBottom: 6 }}>
          英会話マスター
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>
          モードを選択してください
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "min(100%, 380px)" }}>

        {/* 英会話モード */}
        <button onClick={() => onSelect("eikaiwa")}
          style={{
            background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
            border: "none", borderRadius: 20, padding: "24px 20px",
            cursor: "pointer", textAlign: "left", color: "#fff",
            boxShadow: "0 8px 32px rgba(79,70,229,0.4)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 38 }}>🗣️</span>
            <div>
              <p style={{ fontSize: 19, fontWeight: 700, marginBottom: 3 }}>英会話モード</p>
              <p style={{ fontSize: 12, color: "#c7d2fe", lineHeight: 1.5 }}>
                中学・高校レベルの単語とフレーズで<br />日常英会話を身につける
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {["📖 フラッシュカード", "💬 フレーズ集", "🎯 単語クイズ", "❌ 苦手単語"].map((t) => (
              <span key={t} style={{
                background: "rgba(255,255,255,0.15)", borderRadius: 99,
                padding: "3px 9px", fontSize: 10, fontWeight: 600,
              }}>{t}</span>
            ))}
          </div>
        </button>

        {/* TOEICモード */}
        <button onClick={() => onSelect("toeic")}
          style={{
            background: "linear-gradient(135deg,#0f766e,#0284c7)",
            border: "none", borderRadius: 20, padding: "24px 20px",
            cursor: "pointer", textAlign: "left", color: "#fff",
            boxShadow: "0 8px 32px rgba(15,118,110,0.4)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 38 }}>📊</span>
            <div>
              <p style={{ fontSize: 19, fontWeight: 700, marginBottom: 3 }}>TOEIC対策モード</p>
              <p style={{ fontSize: 12, color: "#a5f3fc", lineHeight: 1.5 }}>
                TOEIC 600〜860点レベルの単語と<br />Part別対策で高スコアを目指す
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {["📚 単語学習", "📝 Part1〜7", "🎯 模試", "📈 弱点分析", "❌ 苦手単語"].map((t) => (
              <span key={t} style={{
                background: "rgba(255,255,255,0.15)", borderRadius: 99,
                padding: "3px 9px", fontSize: 10, fontWeight: 600,
              }}>{t}</span>
            ))}
          </div>
        </button>

        {/* 英検準二級対策モード */}
        <button onClick={() => onSelect("eiken")}
          style={{
            background: "linear-gradient(135deg,#166534,#65a30d)",
            border: "none", borderRadius: 20, padding: "24px 20px",
            cursor: "pointer", textAlign: "left", color: "#fff",
            boxShadow: "0 8px 32px rgba(22,101,52,0.4)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 38 }}>🎓</span>
            <div>
              <p style={{ fontSize: 19, fontWeight: 700, marginBottom: 3 }}>英検準二級対策モード</p>
              <p style={{ fontSize: 12, color: "#d9f99d", lineHeight: 1.5 }}>
                大問1〜3の模擬試験をランダム出題<br />過去10回のスコアで実力を確認
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {["📝 模擬試験", "🔀 10パターン出題", "📊 スコア履歴"].map((t) => (
              <span key={t} style={{
                background: "rgba(255,255,255,0.15)", borderRadius: 99,
                padding: "3px 9px", fontSize: 10, fontWeight: 600,
              }}>{t}</span>
            ))}
          </div>
        </button>

        {/* 夏休み課題対策モード */}
        <button onClick={() => onSelect("summer")}
          style={{
            background: "linear-gradient(135deg,#ea580c,#facc15)",
            border: "none", borderRadius: 20, padding: "24px 20px",
            cursor: "pointer", textAlign: "left", color: "#431407",
            boxShadow: "0 8px 32px rgba(234,88,12,0.4)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 38 }}>☀️</span>
            <div>
              <p style={{ fontSize: 19, fontWeight: 700, marginBottom: 3 }}>夏休み課題対策モード</p>
              <p style={{ fontSize: 12, lineHeight: 1.5 }}>
                ターゲット400語から入力式クイズ＋復習<br />モード内ランキングで進捗を競おう
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {["⌨️ 入力式クイズ", "🔁 クイズ+復習セット", "🏆 モード内ランキング"].map((t) => (
              <span key={t} style={{
                background: "rgba(67,20,7,0.15)", borderRadius: 99,
                padding: "3px 9px", fontSize: 10, fontWeight: 600,
              }}>{t}</span>
            ))}
          </div>
        </button>

        {/* 辞書モード */}
        <button onClick={() => onSelect("dictionary")}
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 20, padding: "18px 20px",
            cursor: "pointer", textAlign: "left", color: "#fff",
            display: "flex", alignItems: "center", gap: 14,
          }}>
          <span style={{ fontSize: 34 }}>📖</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0", marginBottom: 3 }}>
              辞書モード
            </p>
            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
              11,292語を英語・日本語で検索<br />
              授業中や学習時に分からない単語を調べる
            </p>
          </div>
          <span style={{ color: "#475569", fontSize: 20 }}>›</span>
        </button>

        {/* ランキング */}
        <button onClick={() => onSelect("ranking")}
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 20, padding: "18px 20px",
            cursor: "pointer", textAlign: "left", color: "#fff",
            display: "flex", alignItems: "center", gap: 14,
          }}>
          <span style={{ fontSize: 34 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0", marginBottom: 3 }}>
              ランキング
            </p>
            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
              正解率・継続日数・学習語数を競おう<br />
              グループ内で4つのランキングを集計
            </p>
          </div>
          <span style={{ color: "#475569", fontSize: 20 }}>›</span>
        </button>
      </div>

      <p style={{ color: "#475569", fontSize: 11, marginTop: 28, textAlign: "center" }}>
        復習リスト・苦手単語・学習履歴は全モードで共有されます
      </p>
    </div>
  );
}
