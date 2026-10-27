// @vitest-environment jsdom
// 画面の動作テスト（API は fetch を差し替える）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AppClient from "../../app/components/AppClient";
import { eikenStore } from "../../app/hooks/useEikenStore";
import { WRITING_QUESTIONS } from "../../app/data/eikenWriting";
import { countWords } from "../../app/lib/eiken/text";

const ESSAY = "I think students should not use smartphones at school. First, they may play games in class. Second, they do not talk with their friends very much. For these reasons, I think so.";

function gradeResponse(total: [number, number, number, number]) {
  const [content, organization, vocabulary, grammar] = total;
  return {
    result: {
      scores: { content, organization, vocabulary, grammar }, total: content + organization + vocabulary + grammar,
      goodPoints: "意見と理由がはっきりしています。", improvements: ["理由に例を加えましょう。"],
      corrections: [{ before: "I am agree.", after: "I agree.", explain: "agree は動詞なので am は不要です。", tag: "agreement" }],
      correctedEssay: ESSAY, modelAnswer: WRITING_QUESTIONS[0].modelAnswer, weaknessTags: ["agreement"], wordCount: 35,
    },
    quota: { used: 1, limit: 10 },
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  eikenStore.clearAll();
  localStorage.setItem("study_history_v1", JSON.stringify({ records: [{ date: "2026-10-01", mode: "toeic", level: "TOEIC600", score: 5, total: 10 }], streak: 2, lastStudyDate: null, totalWordsStudied: 3, monthlyWordsStudied: {} }));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.scrollTo = vi.fn() as never;
});
afterEach(() => cleanup());

const openEiken = () => {
  render(<AppClient vocabulary={[]} phrases={[]} />);
  fireEvent.click(screen.getByText("英検準二級対策モード"));
};
const tab = (label: string) => fireEvent.click(within(screen.getByRole("navigation")).getByText(label));
const textarea = () => screen.getByPlaceholderText("ここに英語で書きます") as HTMLTextAreaElement;

describe("モード選択", () => {
  it("夏休みモードがなくなり、ほかのモードは残っている", () => {
    render(<AppClient vocabulary={[]} phrases={[]} />);
    expect(screen.queryByText(/夏休み/)).toBeNull();
    for (const m of ["英会話モード", "TOEIC対策モード", "英検準二級対策モード"]) expect(screen.getByText(m)).toBeTruthy();
  });
});

describe("英検モード", () => {
  it("ホームに今日のメニュー・試験までの日数・初期診断を表示する", () => {
    openEiken();
    expect(screen.getByText(/今日の学習メニュー/)).toBeTruthy();
    expect(screen.getByText(/一次試験まで/)).toBeTruthy();
    expect(screen.getByText("1144")).toBeTruthy();
    expect(screen.getByText("178")).toBeTruthy();
  });

  it("英作文を書いてAI採点し、結果を表示し、書き直して点数を比べられる", async () => {
    openEiken();
    tab("書く");
    fireEvent.click(screen.getByText(WRITING_QUESTIONS[0].question));
    fireEvent.change(textarea(), { target: { value: ESSAY } });
    expect(screen.getByText(new RegExp(`^${countWords(ESSAY)} 語`))).toBeTruthy();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(gradeResponse([3, 3, 3, 3])), { status: 200 }));
    fireEvent.click(screen.getByText("🤖 AIで採点する"));
    await screen.findByText("🤖 添削結果");
    expect(screen.getByText("I am agree.")).toBeTruthy();
    expect(screen.getByText("I agree.")).toBeTruthy();
    expect(screen.getByText("⭐ 模範解答")).toBeTruthy();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ questionId: "op-01", question: WRITING_QUESTIONS[0].question, essay: ESSAY });

    fireEvent.click(screen.getByText("🔁 同じ問題で書き直す"));
    expect(textarea().value).toBe(ESSAY);
    fireEvent.change(textarea(), { target: { value: ESSAY + " It is better." } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(gradeResponse([4, 3, 3, 4])), { status: 200 }));
    fireEvent.click(screen.getByText("🤖 AIで採点する"));
    await screen.findByText(/最初 12点 → 今回 14点/);

    const saved = JSON.parse(localStorage.getItem("eiken_writing_v1")!);
    expect(saved.attempts).toHaveLength(1);
    expect(saved.attempts[0].rounds).toHaveLength(2);
    expect(saved.reviews.some((r: { id: string }) => r.id.startsWith("fix:"))).toBe(true);
    // 既存の学習履歴は変わらない
    expect(JSON.parse(localStorage.getItem("study_history_v1")!).records).toHaveLength(1);
  });

  it("同じ英文は採点し直さず、採点中のボタン連打でも1回しか送らない", async () => {
    openEiken();
    tab("書く");
    fireEvent.click(screen.getByText(WRITING_QUESTIONS[1].question));
    fireEvent.change(textarea(), { target: { value: ESSAY } });
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolve = r; }));
    const btn = screen.getByText("🤖 AIで採点する");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getByText(/英文を送っています/)).toBeTruthy();
    await act(async () => { resolve(new Response(JSON.stringify(gradeResponse([2, 2, 2, 2])), { status: 200 })); });
    await screen.findByText("🤖 添削結果");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("通信エラーのときは入力を残したままメッセージを出す", async () => {
    openEiken();
    tab("書く");
    fireEvent.click(screen.getByText(WRITING_QUESTIONS[2].question));
    fireEvent.change(textarea(), { target: { value: ESSAY } });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByText("🤖 AIで採点する"));
    await screen.findByText(/通信に失敗しました/);
    expect(textarea().value).toBe(ESSAY);
  });

  it("利用上限のメッセージを表示する", async () => {
    openEiken();
    tab("書く");
    fireEvent.click(screen.getByText(WRITING_QUESTIONS[3].question));
    fireEvent.change(textarea(), { target: { value: ESSAY } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "AI採点は1日10回までです。明日また使えます" }), { status: 429 }));
    fireEvent.click(screen.getByText("🤖 AIで採点する"));
    await screen.findByText(/1日10回まで/);
  });

  it("日本語が入っていると送信しない", () => {
    openEiken();
    tab("書く");
    fireEvent.click(screen.getByText(WRITING_QUESTIONS[4].question));
    fireEvent.change(textarea(), { target: { value: ESSAY + " たのしい" } });
    fireEvent.click(screen.getByText("🤖 AIで採点する"));
    expect(screen.getByText(/日本語や全角の文字が入っています/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("書きかけの英文は自動保存され、再読み込み後に復元される", async () => {
    vi.useFakeTimers();
    try {
      openEiken();
      tab("書く");
      fireEvent.click(screen.getByText(WRITING_QUESTIONS[5].question));
      fireEvent.change(textarea(), { target: { value: "I think it is better" } });
      act(() => { vi.advanceTimersByTime(1000); });
      expect(JSON.parse(localStorage.getItem("eiken_writing_draft_v1")!)["op-06"].text).toBe("I think it is better");
    } finally {
      vi.useRealTimers();
    }
    cleanup();
    // ページを読み直した状態（メモリ上のデータを捨てて localStorage から読む）
    window.dispatchEvent(new StorageEvent("storage", { key: "eiken_writing_draft_v1" }));
    openEiken();
    tab("書く");
    expect(screen.getByText(/書きかけ/)).toBeTruthy();
    fireEvent.click(screen.getByText(WRITING_QUESTIONS[5].question));
    expect(textarea().value).toBe("I think it is better");
    expect(screen.getByText(/前回の続きから再開しました/)).toBeTruthy();
  });

  it("テンプレートを表示・非表示でき、ボタンで書き出しを入れられる", () => {
    openEiken();
    tab("書く");
    fireEvent.click(screen.getByText(WRITING_QUESTIONS[6].question));
    // 第1段階では最初から表示される
    fireEvent.click(screen.getByText("I think ..."));
    expect(textarea().value).toBe("I think ");
    fireEvent.click(screen.getByText("📋 テンプレート"));
    expect(screen.queryByText("First, ...")).toBeNull();
  });

  it("基本文法ドリルを解くと記録され、間違えた問題は復習に入る", () => {
    openEiken();
    tab("苦手");
    fireEvent.click(screen.getByText(/基本文法（50問から/));
    // 最初の問題で、わざと全部の選択肢のうち最初を押す
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent && !/‹|戻る/.test(b.textContent));
    fireEvent.click(buttons[0]);
    expect(screen.getByText(/正解！|おしい！/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem("eiken_writing_v1")!);
    expect(saved.drills).toHaveLength(1);
    if (!saved.drills[0].correct) expect(saved.reviews).toHaveLength(1);
  });

  it("今日の15分から復習ステップを始められる", () => {
    openEiken();
    tab("15分");
    fireEvent.click(screen.getAllByText("始める")[0]);
    expect(screen.getByText("前回の復習")).toBeTruthy();
  });

  it("既存の模擬試験を開ける", () => {
    openEiken();
    tab("模試");
    expect(screen.getByText("模試を開始する")).toBeTruthy();
    fireEvent.click(screen.getByText("模試を開始する"));
    expect(screen.getByText("採点する")).toBeTruthy();
  });

  it("分析タブとプロフィール（データ削除）", () => {
    openEiken();
    tab("分析");
    expect(screen.getByText(/ライティング得点の推移/)).toBeTruthy();
    tab("ホーム");
    fireEvent.click(screen.getByText("👤 プロフィール"));
    fireEvent.click(screen.getByText("記録を削除する…"));
    fireEvent.click(screen.getByText("本当に削除する"));
    expect(localStorage.getItem("eiken_writing_v1")).toBeNull();
    expect(localStorage.getItem("study_history_v1")).not.toBeNull();
  });
});

describe("既存モード（回帰確認）", () => {
  const vocab = [{ id: 1, english: "achieve", japanese: "達成する", katakana: "アチーブ", example: "She achieved her dream.", exampleJp: "彼女は夢を達成した。", category: "動詞", level: "中学" as const },
    ...Array.from({ length: 8 }, (_, i) => ({ id: i + 2, english: `word${i}`, japanese: `訳${i}`, katakana: "", example: "", exampleJp: "", category: "名詞", level: (i % 2 ? "高校" : "TOEIC600") as "高校" | "TOEIC600" }))];
  const phrases = [{ id: 1, english: "How are you?", japanese: "元気？", situation: "あいさつ" }];

  it.each([
    ["英会話モード", /英会話モード/],
    ["TOEIC対策モード", /TOEIC/],
  ])("%s を開いて戻れる", (label, expected) => {
    render(<AppClient vocabulary={vocab} phrases={phrases} />);
    fireEvent.click(screen.getByText(label));
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("‹")[0]);
    expect(screen.getByText("英検準二級対策モード")).toBeTruthy();
  });

  it("辞書で検索できる", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    render(<AppClient vocabulary={vocab} phrases={phrases} />);
    fireEvent.click(screen.getByText("辞書モード"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "achi" } });
    expect(document.body.textContent).toContain("達成する");
  });

  it("月間ランキングを表示できる", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ month: "2026-10", monthLabel: "2026年10月", prevMonth: "2026-09", prevMonthLabel: "2026年9月", users: [], rankings: null, prevChampions: null }), { status: 200 }));
    render(<AppClient vocabulary={vocab} phrases={phrases} />);
    fireEvent.click(screen.getByText("ランキング"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/ranking"));
  });
});
