"use client";
// 英検準2級対策モード（ホーム・今日の15分・ライティング・苦手克服・模試・学習履歴）

import { useMemo, useRef, useState } from "react";
import { eikenStore, useEikenStore } from "../../hooks/useEikenStore";
import type { QuizRecord, StudyHistory } from "../../hooks/useStudyHistory";
import { analyze } from "../../lib/eiken/analysis";
import { buildDailyPlan, TIMED_LIMIT_SEC, type DailyStep } from "../../lib/eiken/curriculum";
import { requestQuestion } from "../../lib/eiken/client";
import { dueCards } from "../../lib/eiken/review";
import { daysThisWeek, streak, studyDays, writingAverage } from "../../lib/eiken/stats";
import { localDate } from "../../lib/eiken/text";
import type { WeaknessTag, WritingAttempt, WritingQuestion } from "../../lib/eiken/types";
import { GRAMMAR_DRILLS, REORDER_DRILLS } from "../../data/eikenDrills";
import { addAiQuestion, findQuestion } from "./actions";
import DrillSession, { type DrillItem } from "./DrillSession";
import EikenHome from "./EikenHome";
import EikenMockExam from "./EikenMockExam";
import HistoryView from "./HistoryView";
import { basicItems, nextQuestion, reviewItems, tagItems } from "./picker";
import ProfileView from "./ProfileView";
import TodayView from "./TodayView";
import { C } from "./ui";
import WeakView from "./WeakView";
import WritingList from "./WritingList";
import WritingPractice from "./WritingPractice";

type Tab = "home" | "today" | "writing" | "weak" | "history";

type View =
  | { kind: "write"; question: WritingQuestion; attemptId?: string; timed?: boolean; limitSec?: number; daily?: boolean }
  | { kind: "drill"; title: string; items: DrillItem[]; daily?: "review" | "basic" }
  | { kind: "mock" }
  | { kind: "profile" };

const TABS: { id: Tab | "mock"; label: string; icon: string }[] = [
  { id: "home",    label: "ホーム", icon: "🏠" },
  { id: "today",   label: "15分",   icon: "⏱" },
  { id: "writing", label: "書く",   icon: "✍️" },
  { id: "weak",    label: "苦手",   icon: "💪" },
  { id: "mock",    label: "模試",   icon: "📝" },
  { id: "history", label: "分析",   icon: "📊" },
];

const DAILY_WRITING_SEC = 6 * 60;
const MAX_DRILL_SESSION_SEC = 20 * 60;

interface Props {
  history:   StudyHistory;
  addRecord: (r: Omit<QuizRecord, "date">) => void;
  onBack:    () => void;
}

export default function EikenMode({ history, addRecord, onBack }: Props) {
  const { profile, data, drafts } = useEikenStore();
  const [tab, setTab] = useState<Tab>("home");
  const [view, setView] = useState<View | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const drillStart = useRef(0);

  const today = localDate();
  const analysis = useMemo(() => analyze(data.attempts, data.drills), [data.attempts, data.drills]);
  const due = useMemo(() => dueCards(data.reviews, today, 10), [data.reviews, today]);
  const plan = useMemo(() => buildDailyPlan({
    profile, attempts: data.attempts, drills: data.drills, analysis, dueReviews: due.length, today,
  }), [profile, data.attempts, data.drills, analysis, due.length, today]);
  const days = useMemo(() => studyDays(data.studySec, data.drills, data.attempts), [data.studySec, data.drills, data.attempts]);
  const doneSteps = data.daily?.date === today ? data.daily.done : [];
  const draftIds = Object.keys(drafts).filter((k) => !k.startsWith("rw:") && drafts[k].text.trim());
  const latestAttempt = data.attempts.at(-1);

  const openDrill = (title: string, items: DrillItem[], daily?: "review" | "basic") => {
    drillStart.current = Date.now();
    setView({ kind: "drill", title, items, daily });
  };
  const closeDrill = () => {
    const sec = Math.min(MAX_DRILL_SESSION_SEC, Math.round((Date.now() - drillStart.current) / 1000));
    eikenStore.addStudySeconds(sec);
    setView(null);
  };

  const openWrite = (question: WritingQuestion, opts: Partial<Extract<View, { kind: "write" }>> = {}) =>
    setView({ ...opts, kind: "write", question });

  /** 弱点に合わせた問題をAIで作る。失敗したら問題集から出題する */
  const aiQuestion = async (focus: WeaknessTag | undefined, daily = false) => {
    if (generating) return;
    setGenerating(true);
    setNotice(null);
    const seen = [...data.aiQuestions.map((q) => q.id), ...data.attempts.map((a) => a.questionId)];
    let q: WritingQuestion | null = null;
    let reason = "";
    try {
      const res = await requestQuestion(focus, seen);
      q = res.question;
      reason = res.reason ?? "";
    } catch {
      reason = "network";
    }
    setGenerating(false);
    if (q) {
      addAiQuestion(q);
      openWrite(q, { daily, limitSec: daily ? DAILY_WRITING_SEC : undefined });
      return;
    }
    setNotice(reason === "limit"
      ? "今日のAIの利用回数に達したので、問題集から出題します。"
      : "AIで問題を作れなかったので、問題集から出題します。");
    openWrite(nextQuestion(data.attempts, data.aiQuestions, []), { daily, limitSec: daily ? DAILY_WRITING_SEC : undefined });
  };

  const runStep = (step: DailyStep["key"]) => {
    setNotice(null);
    if (step === "review") {
      let items = reviewItems(due, 3);
      if (items.length === 0) items = tagItems(plan.focusTags[0] ?? "grammar", 3);
      openDrill("前回の復習", items, "review");
    } else if (step === "basic") {
      const [g, r] = plan.extraBasics ? [5, 3] : plan.stage.no <= 2 ? [3, 2] : [2, 3];
      openDrill("英作文基礎練習", basicItems(plan.focusTags, data.drills, g, r), "basic");
    } else if (step === "writing") {
      const limitSec = plan.timed ? TIMED_LIMIT_SEC : DAILY_WRITING_SEC;
      // 書きかけがあればそれを続ける
      const draftQ = draftIds.map(findQuestion).find(Boolean);
      if (draftQ) { openWrite(draftQ, { daily: true, limitSec, timed: plan.timed }); return; }
      const dueQ = due.filter((c) => c.id.startsWith("q:")).map((c) => c.refId);
      // 第3段階以降で弱点がはっきりしていれば、弱点に合わせた問題をAIで作る
      if (dueQ.length === 0 && plan.stage.no >= 3 && plan.focusTags.length > 0 && data.attempts.length >= 5) {
        void aiQuestion(plan.focusTags[0], true);
        return;
      }
      openWrite(nextQuestion(data.attempts, data.aiQuestions, dueQ), { daily: true, limitSec, timed: plan.timed });
    } else if (step === "check" && latestAttempt) {
      const q = findQuestion(latestAttempt.questionId);
      if (q) {
        eikenStore.markDailyStep("check");
        openWrite(q, { attemptId: latestAttempt.id });
      }
    }
  };

  const openAttempt = (a: WritingAttempt) => {
    const q = findQuestion(a.questionId);
    if (q) openWrite(q, { attemptId: a.id });
  };

  // ── 全画面表示のサブ画面 ──
  if (view?.kind === "mock") {
    return <EikenMockExam history={history} addRecord={addRecord} onBack={() => setView(null)} />;
  }
  if (view?.kind === "profile") {
    return <ProfileView onBack={() => setView(null)} />;
  }
  if (view?.kind === "drill") {
    return (
      <DrillSession title={view.title} items={view.items} onBack={closeDrill}
        onFinish={() => { if (view.daily) eikenStore.markDailyStep(view.daily); }} />
    );
  }
  if (view?.kind === "write") {
    return (
      <WritingPractice
        key={`${view.question.id}-${view.attemptId ?? "new"}`}
        question={view.question}
        initialAttemptId={view.attemptId}
        showTemplateDefault={plan.showTemplate}
        limitSec={view.limitSec}
        timed={view.timed}
        onBack={() => setView(null)}
        onGraded={() => { if (view.daily) eikenStore.markDailyStep("writing"); }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", position: "relative" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.card}`,
        padding: "12px 16px", paddingTop: "max(12px,env(safe-area-inset-top))",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button onClick={onBack} aria-label="モード選択に戻る"
          style={{ background: C.card, border: "none", borderRadius: 8, padding: "6px 10px",
                   color: C.sub, cursor: "pointer", fontSize: 16 }}>
          ‹
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 700 }}>🎓 英検準二級対策</h1>
      </header>

      <main style={{ padding: "16px 16px 100px" }}>
        {notice && (
          <p style={{ background: "rgba(245,158,11,0.12)", border: `1px solid ${C.warn}`, color: "#fcd34d",
                      borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 14 }}>{notice}</p>
        )}
        {generating && (
          <p style={{ color: C.accent, fontSize: 14, marginBottom: 14 }}>⏳ あなた向けの問題を作っています（30秒ほどかかります）…</p>
        )}

        {tab === "home" && (
          <EikenHome profile={profile} plan={plan} analysis={analysis} doneSteps={doneSteps}
            streak={streak(days, today)} weekDays={daysThisWeek(days, today)} writingAvg={writingAverage(data.attempts)}
            onStart={() => setTab("today")} onProfile={() => setView({ kind: "profile" })} />
        )}
        {tab === "today" && (
          <TodayView plan={plan} doneSteps={doneSteps} hasDraft={draftIds.length > 0} hasResult={Boolean(latestAttempt)} onRun={runStep} />
        )}
        {tab === "writing" && (
          <WritingList attempts={data.attempts} aiQuestions={data.aiQuestions} draftIds={draftIds}
            onOpen={(q) => openWrite(q)}
            onTimed={() => openWrite(nextQuestion(data.attempts, data.aiQuestions, []), { timed: true, limitSec: TIMED_LIMIT_SEC })} />
        )}
        {tab === "weak" && (
          <WeakView analysis={analysis} dueCount={due.length} generating={generating}
            onReview={() => openDrill("復習", reviewItems(due, 6))}
            onDrill={(t) => openDrill("苦手克服", tagItems(t, 6))}
            onBasics={(k) => openDrill(k === "grammar" ? "基本文法" : "英作文並べ替え",
              (k === "grammar" ? GRAMMAR_DRILLS : REORDER_DRILLS)
                .map((d): DrillItem => ("chunks" in d ? { type: "reorder", drill: d } : { type: "grammar", drill: d }))
                .sort(() => Math.random() - 0.5).slice(0, 10))}
            onAiQuestion={(t) => void aiQuestion(t)} />
        )}
        {tab === "history" && (
          <HistoryView attempts={data.attempts} drills={data.drills} studySec={data.studySec}
            studyDayCount={days.size} analysis={analysis} today={today} onOpenAttempt={openAttempt} />
        )}
      </main>

      <nav style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 640, background: C.bg, borderTop: `1px solid ${C.card}`,
        display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom,0px)",
      }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button key={t.id}
              onClick={() => (t.id === "mock" ? setView({ kind: "mock" }) : setTab(t.id))}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                       gap: 2, padding: "10px 0", border: "none", background: "none", cursor: "pointer", minHeight: 58,
                       color: active ? C.accent : C.muted, fontSize: 11, fontWeight: 600, position: "relative" }}>
              <span style={{ fontSize: 21, lineHeight: 1 }}>{t.icon}</span>
              <span>{t.label}</span>
              {t.id === "weak" && due.length > 0 && (
                <span style={{ position: "absolute", top: 6, right: "calc(50% - 20px)", background: C.warn, color: C.bg,
                               fontSize: 9, fontWeight: 700, width: 16, height: 16, borderRadius: 99,
                               display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {due.length > 9 ? "9+" : due.length}
                </span>
              )}
              {active && <span style={{ position: "absolute", bottom: 0, width: 24, height: 2, background: C.accent, borderRadius: 2 }} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
