"use client";
import { useState, useEffect, useCallback } from "react";
import type { StudyHistory } from "../hooks/useStudyHistory";

type RankTab = "overall" | "quizAvg" | "streak" | "totalWords";

interface RankedEntry { nickname: string; value: number; rank: number; points: number; }
interface OverallEntry { nickname: string; totalPoints: number; rank: number; }
interface Rankings {
  quizAvg:    RankedEntry[];
  streak:     RankedEntry[];
  totalWords: RankedEntry[];
  overall:    OverallEntry[];
}
interface PrevChampions {
  overall:    OverallEntry    | null;
  quizAvg:    RankedEntry     | null;
  streak:     RankedEntry     | null;
  totalWords: RankedEntry     | null;
}
interface RankData {
  month:          string;
  monthLabel:     string;
  prevMonth:      string;
  prevMonthLabel: string;
  users:          unknown[];
  rankings:       Rankings | null;
  prevChampions:  PrevChampions | null;
}

const TABS: { id: RankTab; label: string; icon: string }[] = [
  { id: "overall",    label: "総合",    icon: "🏆" },
  { id: "quizAvg",   label: "正解率",  icon: "🎯" },
  { id: "streak",    label: "継続日数", icon: "🔥" },
  { id: "totalWords",label: "学習語数", icon: "📖" },
];

const MEDAL = ["🥇", "🥈", "🥉"];

function formatValue(tab: RankTab, value: number): string {
  if (tab === "quizAvg")    return value.toFixed(1) + "%";
  if (tab === "streak")     return value + "日";
  if (tab === "totalWords") return value.toLocaleString() + "語";
  return "";
}

interface Props {
  history: StudyHistory;
  onBack:  () => void;
}

export default function RankingMode({ history, onBack }: Props) {
  const [nickname,        setNicknameState]   = useState<string | null>(null);
  const [nicknameInput,   setNicknameInput]   = useState("");
  const [editingNickname, setEditingNickname] = useState(false);
  const [tab,             setTab]             = useState<RankTab>("overall");
  const [data,            setData]            = useState<RankData | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitMsg,       setSubmitMsg]       = useState<string | null>(null);

  useEffect(() => {
    try {
      const n = localStorage.getItem("nickname_v1");
      if (n) setNicknameState(n);
    } catch {}
  }, []);

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ranking");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "fetch failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRankings(); }, [fetchRankings]);

  const saveNickname = () => {
    const name = nicknameInput.trim().slice(0, 12);
    if (!name) return;
    try { localStorage.setItem("nickname_v1", name); } catch {}
    setNicknameState(name);
    setEditingNickname(false);
    setNicknameInput("");
  };

  const quizAvg = (() => {
    const recs = history.records.filter((r) => r.total > 0);
    if (!recs.length) return 0;
    return (recs.reduce((s, r) => s + r.score / r.total, 0) / recs.length) * 100;
  })();

  const submitScore = async () => {
    if (!nickname) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch("/api/ranking/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          quizAvg:    Math.round(quizAvg * 10) / 10,
          streak:     history.streak,
          totalWords: history.totalWordsStudied,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "error");
      setSubmitMsg("✅ 送信しました！");
      await fetchRankings();
    } catch {
      setSubmitMsg("❌ 送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", position: "relative" }}>

      {/* ヘッダー */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#0f172a", borderBottom: "1px solid #1e293b",
        padding: "12px 16px", paddingTop: "max(12px,env(safe-area-inset-top))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack}
            style={{ background: "#1e293b", border: "none", borderRadius: 8,
                     padding: "6px 10px", color: "#94a3b8", cursor: "pointer",
                     fontSize: 16, flexShrink: 0, lineHeight: 1 }}>
            ‹
          </button>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}>🏆 ランキング</h1>
            {data?.monthLabel && (
              <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {data.monthLabel}集計
              </p>
            )}
          </div>
        </div>
        {nickname && !editingNickname && (
          <button
            onClick={() => { setNicknameInput(nickname); setEditingNickname(true); }}
            style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
                     padding: "4px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>
            👤 {nickname}
          </button>
        )}
      </header>

      <main style={{ padding: "16px 16px 100px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ニックネーム設定 */}
        {(!nickname || editingNickname) && (
          <div style={{ background: "#1e293b", border: "1px solid #334155",
                        borderRadius: 16, padding: 20 }}>
            <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              {editingNickname ? "ニックネームを変更" : "👤 ニックネームを登録"}
            </p>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>
              ランキングに表示される名前を設定してください（最大12文字）
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value.slice(0, 12))}
                onKeyDown={(e) => e.key === "Enter" && saveNickname()}
                placeholder="例：さくら"
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10,
                  background: "#0f172a", border: "1px solid #334155",
                  color: "#e2e8f0", fontSize: 16, outline: "none",
                }}
              />
              <button onClick={saveNickname} disabled={!nicknameInput.trim()}
                style={{
                  background: nicknameInput.trim() ? "#4f46e5" : "#1e293b",
                  border: "none", borderRadius: 10, padding: "10px 18px",
                  color: "#fff", cursor: nicknameInput.trim() ? "pointer" : "default",
                  fontSize: 14, fontWeight: 600, flexShrink: 0,
                }}>
                登録
              </button>
              {editingNickname && (
                <button onClick={() => setEditingNickname(false)}
                  style={{ background: "#334155", border: "none", borderRadius: 10,
                           padding: "10px 14px", color: "#94a3b8",
                           cursor: "pointer", fontSize: 14, flexShrink: 0 }}>
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* 先月のチャンピオン */}
        {data?.prevChampions && (
          <PrevChampionCard
            label={data.prevMonthLabel}
            champions={data.prevChampions}
          />
        )}

        {/* タブ */}
        <div style={{ display: "flex", background: "#1e293b", borderRadius: 12, padding: 4, gap: 2 }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 10, border: "none",
                cursor: "pointer",
                background: tab === t.id ? "#4f46e5" : "transparent",
                color: tab === t.id ? "#fff" : "#64748b",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ランキング本体 */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
            読み込み中...
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: "#ef4444", marginBottom: 12 }}>{error}</p>
            <button onClick={fetchRankings}
              style={{ background: "#1e293b", border: "1px solid #334155",
                       borderRadius: 10, padding: "8px 20px",
                       color: "#94a3b8", cursor: "pointer", fontSize: 14 }}>
              再試行
            </button>
          </div>
        ) : !data?.rankings ? (
          <EmptyState />
        ) : (
          <RankList tab={tab} rankings={data.rankings} myNickname={nickname} />
        )}

        {/* スコア送信パネル */}
        {nickname && (
          <div style={{ background: "#1e293b", border: "1px solid #334155",
                        borderRadius: 16, padding: 16 }}>
            <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              📊 あなたの今月のスコア
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { icon: "🎯", label: "正解率",   value: quizAvg.toFixed(1) + "%" },
                { icon: "🔥", label: "継続日数", value: history.streak + "日" },
                { icon: "📖", label: "累計語数", value: history.totalWordsStudied.toLocaleString() + "語" },
              ].map(({ icon, label, value }) => (
                <div key={label}
                  style={{ background: "#0f172a", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <p style={{ fontSize: 20 }}>{icon}</p>
                  <p style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700 }}>{value}</p>
                  <p style={{ color: "#64748b", fontSize: 10 }}>{label}</p>
                </div>
              ))}
            </div>
            <button onClick={submitScore} disabled={submitting}
              style={{
                width: "100%", padding: "12px", borderRadius: 12, border: "none",
                background: submitting
                  ? "#334155"
                  : "linear-gradient(135deg,#4f46e5,#7c3aed)",
                color: "#fff", fontSize: 15, fontWeight: 700,
                cursor: submitting ? "default" : "pointer",
              }}>
              {submitting ? "送信中..." : "🏆 ランキングを更新"}
            </button>
            {submitMsg && (
              <p style={{
                textAlign: "center", marginTop: 8, fontSize: 13,
                color: submitMsg.startsWith("✅") ? "#10b981" : "#ef4444",
              }}>
                {submitMsg}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── 先月のチャンピオン ──────────────────────────────────────

function PrevChampionCard({ label, champions }: {
  label:     string;
  champions: PrevChampions;
}) {
  const rows: { icon: string; cat: string; entry: RankedEntry | OverallEntry | null }[] = [
    { icon: "🏆", cat: "総合",    entry: champions.overall },
    { icon: "🎯", cat: "正解率",  entry: champions.quizAvg },
    { icon: "🔥", cat: "継続日数", entry: champions.streak },
    { icon: "📖", cat: "学習語数", entry: champions.totalWords },
  ];

  const formatChampValue = (cat: string, entry: RankedEntry | OverallEntry) => {
    if (cat === "総合")    return (entry as OverallEntry).totalPoints + "pt";
    const e = entry as RankedEntry;
    if (cat === "正解率")  return e.value.toFixed(1) + "%";
    if (cat === "継続日数") return e.value + "日";
    if (cat === "学習語数") return e.value.toLocaleString() + "語";
    return "";
  };

  return (
    <div style={{
      background: "linear-gradient(135deg,rgba(251,191,36,0.08),rgba(245,158,11,0.04))",
      border: "1px solid rgba(251,191,36,0.3)",
      borderRadius: 16, padding: 16,
    }}>
      <p style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
        👑 先月のチャンピオン（{label}）
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(({ icon, cat, entry }) =>
          entry ? (
            <div key={cat}
              style={{ display: "flex", alignItems: "center", gap: 10,
                       background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "8px 12px" }}>
              <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{icon}</span>
              <span style={{ color: "#94a3b8", fontSize: 12, width: 54 }}>{cat}</span>
              <span style={{ flex: 1, color: "#fde68a", fontWeight: 700, fontSize: 14 }}>
                🥇 {entry.nickname}
              </span>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>
                {formatChampValue(cat, entry)}
              </span>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

// ── 空状態 ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      textAlign: "center", padding: "40px 20px",
      background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
    }}>
      <p style={{ fontSize: 48, marginBottom: 12 }}>🏆</p>
      <p style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
        今月のランキングがありません
      </p>
      <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
        ニックネームを登録して<br />「ランキングを更新」を押しましょう！
      </p>
    </div>
  );
}

// ── ランキングリスト ─────────────────────────────────────────

function RankList({ tab, rankings, myNickname }: {
  tab:        RankTab;
  rankings:   Rankings;
  myNickname: string | null;
}) {
  if (tab === "overall") {
    const maxPt = rankings.overall[0]?.totalPoints ?? 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ color: "#64748b", fontSize: 11, textAlign: "right" }}>
          最高得点: {maxPt}pt
        </p>
        {rankings.overall.map((e) => (
          <RankRow key={e.nickname} rank={e.rank} nickname={e.nickname}
            isMine={e.nickname === myNickname}
            right={
              <span style={{ color: "#fbbf24", fontWeight: 800, fontSize: 17 }}>
                {e.totalPoints}
                <span style={{ color: "#64748b", fontSize: 11, fontWeight: 400 }}>pt</span>
              </span>
            }
          />
        ))}
      </div>
    );
  }

  const entries = rankings[tab];
  const tabInfo = TABS.find((t) => t.id === tab)!;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ color: "#64748b", fontSize: 11 }}>
        {tabInfo.icon} {tabInfo.label}ランキング
      </p>
      {entries.map((e) => (
        <RankRow key={e.nickname} rank={e.rank} nickname={e.nickname}
          isMine={e.nickname === myNickname}
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>
                {formatValue(tab, e.value)}
              </span>
              <span style={{ background: "#334155", color: "#94a3b8",
                             fontSize: 10, padding: "2px 8px", borderRadius: 99 }}>
                {e.points}pt
              </span>
            </div>
          }
        />
      ))}
    </div>
  );
}

// ── 個別の行 ────────────────────────────────────────────────

function RankRow({ rank, nickname, isMine, right }: {
  rank:     number;
  nickname: string;
  isMine:   boolean;
  right:    React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 14px", borderRadius: 14,
      background: isMine ? "rgba(79,70,229,0.12)" : "#1e293b",
      border: `1px solid ${isMine ? "#4f46e5" : "#334155"}`,
    }}>
      <span style={{
        fontSize: rank <= 3 ? 20 : 13,
        minWidth: 28, textAlign: "center",
        color: rank > 3 ? "#64748b" : undefined,
        fontWeight: rank > 3 ? 600 : undefined,
      }}>
        {rank <= 3 ? MEDAL[rank - 1] : `${rank}位`}
      </span>
      <span style={{
        flex: 1, color: isMine ? "#a5b4fc" : "#e2e8f0",
        fontWeight: isMine ? 700 : 500, fontSize: 15,
      }}>
        {nickname}
        {isMine && (
          <span style={{ fontSize: 10, color: "#818cf8", marginLeft: 6 }}>（あなた）</span>
        )}
      </span>
      {right}
    </div>
  );
}
