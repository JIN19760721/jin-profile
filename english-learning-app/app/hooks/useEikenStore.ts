"use client";
// 英検ライティング学習のデータ（端末内の localStorage に保存）
// 既存の study_history_v1 とは別のキーに保存し、既存データには触らない。

import { useSyncExternalStore } from "react";
import type {
  DrillRecord, EikenProfile, GradeResult, ReviewCard, StudyMinutes, WritingAttempt, WritingQuestion,
} from "../lib/eiken/types";
import { localDate } from "../lib/eiken/text";

export const PROFILE_KEY = "eiken_profile_v1";
export const DATA_KEY    = "eiken_writing_v1";
export const DRAFT_KEY   = "eiken_writing_draft_v1";

const MAX_ATTEMPTS = 300;
const MAX_DRILLS   = 2000;
const MAX_CACHE    = 100;

export const DEFAULT_PROFILE: EikenProfile = {
  grade:        "高校1年生",
  targetExam:   "英検準2級",
  examDate:     "2027-01-24",
  dailyMinutes: 15,
  cse:          { reading: 445, listening: 411, writing: 288 },
  passLine:     1322,
  showTemplate: "auto",
  writingDetails: [],
};

export interface DailyProgress {
  date:  string;
  done:  string[];              // 終わったステップ（"review" など）
}

export interface EikenData {
  attempts:    WritingAttempt[];
  drills:      DrillRecord[];
  reviews:     ReviewCard[];
  studySec:    StudyMinutes;
  daily:       DailyProgress | null;
  gradeCache:  Record<string, GradeResult>;  // 同じ答案の再採点を防ぐ
  aiQuestions: WritingQuestion[];
}

export interface Draft {
  text:      string;
  seconds:   number;
  updatedAt: string;
}

const EMPTY: EikenData = {
  attempts: [], drills: [], reviews: [], studySec: {}, daily: null, gradeCache: {}, aiQuestions: [],
};

interface State {
  profile: EikenProfile;
  data:    EikenData;
  drafts:  Record<string, Draft>;
}

const SERVER_STATE: State = { profile: DEFAULT_PROFILE, data: EMPTY, drafts: {} };

let state: State | null = null;
const listeners = new Set<() => void>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function load(): State {
  if (state) return state;
  state = {
    profile: read(PROFILE_KEY, DEFAULT_PROFILE),
    data:    read(DATA_KEY, EMPTY),
    drafts:  read<Record<string, Draft>>(DRAFT_KEY, {}),
  };
  return state;
}

function emit() { listeners.forEach((l) => l()); }

function subscribe(l: () => void) {
  listeners.add(l);
  // 別のタブで変更されたら読み直す
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROFILE_KEY || e.key === DATA_KEY || e.key === DRAFT_KEY) { state = null; emit(); }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

function trimCache(cache: Record<string, GradeResult>) {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_CACHE) return cache;
  return Object.fromEntries(keys.slice(keys.length - MAX_CACHE).map((k) => [k, cache[k]]));
}

export const eikenStore = {
  get: load,

  updateProfile(patch: Partial<EikenProfile>) {
    const s = load();
    state = { ...s, profile: { ...s.profile, ...patch } };
    write(PROFILE_KEY, state.profile);
    emit();
  },

  updateData(fn: (d: EikenData) => EikenData) {
    const s = load();
    const d = fn(s.data);
    const next: EikenData = {
      ...d,
      attempts:   d.attempts.slice(-MAX_ATTEMPTS),
      drills:     d.drills.slice(-MAX_DRILLS),
      gradeCache: trimCache(d.gradeCache),
    };
    state = { ...s, data: next };
    write(DATA_KEY, next);
    emit();
  },

  saveDraft(questionId: string, draft: Draft | null) {
    const s = load();
    const drafts = { ...s.drafts };
    if (draft) drafts[questionId] = draft; else delete drafts[questionId];
    state = { ...s, drafts };
    write(DRAFT_KEY, drafts);
    emit();
  },

  addStudySeconds(sec: number) {
    if (sec <= 0) return;
    const today = localDate();
    eikenStore.updateData((d) => ({ ...d, studySec: { ...d.studySec, [today]: (d.studySec[today] ?? 0) + sec } }));
  },

  markDailyStep(step: string) {
    const today = localDate();
    eikenStore.updateData((d) => {
      const cur = d.daily?.date === today ? d.daily : { date: today, done: [] };
      return cur.done.includes(step) ? d : { ...d, daily: { date: today, done: [...cur.done, step] } };
    });
  },

  /** 英検ライティングのデータだけを消す（他のモードのデータは消さない） */
  clearAll() {
    try {
      localStorage.removeItem(DATA_KEY);
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch {}
    state = null;
    emit();
  },
};

export function useEikenStore(): State {
  return useSyncExternalStore(subscribe, load, () => SERVER_STATE);
}
