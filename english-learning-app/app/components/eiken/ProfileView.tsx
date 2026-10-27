"use client";
import { useState } from "react";
import { eikenStore, useEikenStore } from "../../hooks/useEikenStore";
import { CRITERIA, CRITERION_LABEL, type CriterionScores, type EikenProfile } from "../../lib/eiken/types";
import { localDate } from "../../lib/eiken/text";
import { Btn, C, Card, CardTitle, SubHeader } from "./ui";

const input: React.CSSProperties = {
  width: "100%", background: C.bg, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 16, minHeight: 44,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", color: C.sub, fontSize: 13, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

export default function ProfileView({ onBack }: { onBack: () => void }) {
  const { profile } = useEikenStore();
  const [form, setForm] = useState<EikenProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [detailDate, setDetailDate] = useState(localDate());
  const [detail, setDetail] = useState<CriterionScores>({ content: 0, organization: 0, vocabulary: 0, grammar: 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (patch: Partial<EikenProfile>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };
  const save = () => { eikenStore.updateProfile(form); setSaved(true); };

  const addDetail = () => {
    const next = { ...form, writingDetails: [...form.writingDetails, { date: detailDate, opinion: detail }] };
    setForm(next);
    eikenStore.updateProfile({ writingDetails: next.writingDetails });
  };
  const removeDetail = (i: number) => {
    const list = form.writingDetails.filter((_, j) => j !== i);
    setForm({ ...form, writingDetails: list });
    eikenStore.updateProfile({ writingDetails: list });
  };

  const total = form.cse.reading + form.cse.listening + form.cse.writing;

  return (
    <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
      <SubHeader title="👤 プロフィール" onBack={onBack} />
      <main style={{ padding: "14px 16px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <CardTitle>学習の設定</CardTitle>
          <Field label="学年"><input style={input} value={form.grade} onChange={(e) => set({ grade: e.target.value.slice(0, 20) })} /></Field>
          <Field label="目標の試験"><input style={input} value={form.targetExam} onChange={(e) => set({ targetExam: e.target.value.slice(0, 20) })} /></Field>
          <Field label="一次試験の日"><input type="date" style={input} value={form.examDate} onChange={(e) => set({ examDate: e.target.value || form.examDate })} /></Field>
          <Field label="1日の学習時間（分）">
            <input type="number" inputMode="numeric" style={input} value={form.dailyMinutes}
              onChange={(e) => set({ dailyMinutes: num(e.target.value, 5, 120) })} />
          </Field>
          <Field label="英作文テンプレートの表示">
            <select style={input} value={form.showTemplate} onChange={(e) => set({ showTemplate: e.target.value as EikenProfile["showTemplate"] })}>
              <option value="auto">学習段階に合わせる（第3段階まで表示）</option>
              <option value="on">いつも表示する</option>
              <option value="off">表示しない</option>
            </select>
          </Field>
        </Card>

        <Card>
          <CardTitle>前回の英検の結果（CSEスコア）</CardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {(["reading", "listening", "writing"] as const).map((k) => (
              <Field key={k} label={k === "reading" ? "Reading" : k === "listening" ? "Listening" : "Writing"}>
                <input type="number" inputMode="numeric" style={input} value={form.cse[k]}
                  onChange={(e) => set({ cse: { ...form.cse, [k]: num(e.target.value, 0, 900) } })} />
              </Field>
            ))}
          </div>
          <Field label="一次試験の合格基準">
            <input type="number" inputMode="numeric" style={input} value={form.passLine}
              onChange={(e) => set({ passLine: num(e.target.value, 0, 3000) })} />
          </Field>
          <p style={{ color: C.sub, fontSize: 14 }}>合計 {total}（合格基準まで {Math.max(0, form.passLine - total)}）</p>
        </Card>

        {saved && <p style={{ color: C.good, fontSize: 14, textAlign: "center" }}>✓ 保存しました</p>}
        <Btn onClick={save}>設定を保存する</Btn>

        <Card>
          <CardTitle>ライティングの詳しい採点結果（英検の成績表から）</CardTitle>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>
            成績表に書かれている意見論述（英作文）の観点別の得点を登録できます。
          </p>
          <Field label="試験日"><input type="date" style={input} value={detailDate} onChange={(e) => setDetailDate(e.target.value)} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
            {CRITERIA.map((c) => (
              <Field key={c} label={`${CRITERION_LABEL[c]}（0〜4）`}>
                <select style={input} value={detail[c]} onChange={(e) => setDetail({ ...detail, [c]: Number(e.target.value) })}>
                  {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <Btn kind="secondary" onClick={addDetail}>この結果を登録する</Btn>
          {form.writingDetails.map((d, i) => (
            <div key={`${d.date}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                                                 padding: "10px 0", borderTop: `1px solid ${C.border}`, marginTop: i === 0 ? 12 : 0 }}>
              <span style={{ color: C.text, fontSize: 14 }}>
                {d.date}：{CRITERIA.map((c) => `${CRITERION_LABEL[c]}${d.opinion[c]}`).join(" ")}（計{CRITERIA.reduce((s, c) => s + d.opinion[c], 0)}）
              </span>
              <button onClick={() => removeDetail(i)} style={{ background: "none", border: "none", color: C.bad, fontSize: 13, cursor: "pointer", minHeight: 40 }}>削除</button>
            </div>
          ))}
        </Card>

        <Card>
          <CardTitle>データの削除</CardTitle>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>
            この端末に保存されている英検ライティングの記録（英作文・採点結果・復習・プロフィール）をすべて削除します。
            ほかのモードの学習履歴や模試の記録は消えません。元に戻せません。
          </p>
          {!confirmDelete ? (
            <Btn kind="secondary" onClick={() => setConfirmDelete(true)}>記録を削除する…</Btn>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <Btn kind="secondary" onClick={() => setConfirmDelete(false)}>やめる</Btn>
              <Btn style={{ background: C.bad }} onClick={() => { eikenStore.clearAll(); setConfirmDelete(false); onBack(); }}>本当に削除する</Btn>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
