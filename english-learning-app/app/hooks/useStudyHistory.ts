"use client";
import { useState, useEffect } from "react";

export interface QuizRecord {
  date:  string;                         // YYYY-MM-DD
  mode:  "eikaiwa" | "toeic";
  level: string;                         // 中学/高校/TOEIC600 など
  score: number;
  total: number;
}

export interface StudyHistory {
  records:           QuizRecord[];
  streak:            number;
  lastStudyDate:     string | null;
  totalWordsStudied: number;
}

const STORAGE_KEY = "study_history_v1";

const defaultHistory: StudyHistory = {
  records: [], streak: 0, lastStudyDate: null, totalWordsStudied: 0,
};

function today()     { return new Date().toISOString().split("T")[0]; }
function yesterday() { return new Date(Date.now() - 86400000).toISOString().split("T")[0]; }

export function useStudyHistory() {
  const [history, setHistory] = useState<StudyHistory>(defaultHistory);

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) setHistory(JSON.parse(s));
    } catch {}
  }, []);

  const save = (h: StudyHistory) => {
    setHistory(h);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); } catch {}
  };

  const calcStreak = (h: StudyHistory): number => {
    const d = today();
    if (h.lastStudyDate === d)         return h.streak;
    if (h.lastStudyDate === yesterday()) return h.streak + 1;
    return 1;
  };

  const addRecord = (rec: Omit<QuizRecord, "date">) => {
    save({
      ...history,
      records:       [...history.records.slice(-200), { ...rec, date: today() }],
      streak:        calcStreak(history),
      lastStudyDate: today(),
    });
  };

  const addWordsStudied = (n: number) => {
    save({
      ...history,
      totalWordsStudied: history.totalWordsStudied + n,
      streak:            calcStreak(history),
      lastStudyDate:     today(),
    });
  };

  // レベル別平均スコア
  const avgByLevel = (level: string): number | null => {
    const recs = history.records.filter((r) => r.level === level && r.total > 0);
    if (recs.length === 0) return null;
    return recs.reduce((s, r) => s + r.score / r.total, 0) / recs.length;
  };

  return { history, addRecord, addWordsStudied, avgByLevel };
}
