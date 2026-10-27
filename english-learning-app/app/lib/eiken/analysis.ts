// 苦手分野の分析
// ・直近の結果ほど重く数える（1つ前に戻るごとに重みを DECAY 倍にする）
// ・解答数が少ないうちは「判定には解答が足りない」として断定しない

import {
  CRITERIA, WEAKNESS_TAGS,
  type Criterion, type DrillRecord, type WeaknessTag, type WritingAttempt,
} from "./types";

const DECAY = 0.85;
/** 4観点の習熟度を出すのに必要な英作文の数 */
export const MIN_ESSAYS = 3;
/** 1つの弱点タグを判定するのに必要な観測数（英作文＋ドリル） */
export const MIN_TAG_SAMPLES = 4;

export interface CriterionMastery {
  criterion: Criterion;
  average:   number | null;    // 0〜4（重み付き平均）。データ不足なら null
  samples:   number;
}

export interface TagStat {
  tag:        WeaknessTag;
  rate:       number;           // 0〜1 のミス率（重み付き）
  samples:    number;
  enough:     boolean;          // 判定に十分な数があるか
  trend:      "improving" | "worse" | "flat" | "unknown";
  older?:     number;           // 前半（古いほう）のミス率
  recent?:    number;           // 後半（新しいほう）のミス率
}

export interface Analysis {
  essays:     number;
  mastery:    CriterionMastery[];
  tags:       TagStat[];        // ミス率が高い順
  weak:       TagStat[];        // 判定に十分な数があり、ミス率が高いもの（最大3つ）
  tentative:  TagStat[];        // データは少ないが気になるもの
  message:    string;
}

/** 英作文の結果は1回目（書き直し前）を使う */
function firstResults(attempts: WritingAttempt[]) {
  return [...attempts]
    .filter((a) => a.rounds.length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((a) => ({ at: a.createdAt, result: a.rounds[0].result }));
}

/** 新しい順に並べたときの重み */
const weightAt = (indexFromNewest: number) => Math.pow(DECAY, indexFromNewest);

export function analyze(attempts: WritingAttempt[], drills: DrillRecord[]): Analysis {
  const essays = firstResults(attempts);
  const newestFirst = [...essays].reverse();

  const mastery: CriterionMastery[] = CRITERIA.map((criterion) => {
    if (newestFirst.length < MIN_ESSAYS) return { criterion, average: null, samples: newestFirst.length };
    let sum = 0, wsum = 0;
    newestFirst.slice(0, 10).forEach((e, i) => {
      const w = weightAt(i);
      sum += e.result.scores[criterion] * w;
      wsum += w;
    });
    return { criterion, average: Math.round((sum / wsum) * 10) / 10, samples: newestFirst.length };
  });

  // 観測：英作文1本ごとに「そのタグのミスがあったか」、ドリル1問ごとに「そのタグで間違えたか」
  type Obs = { at: string; miss: boolean };
  const obs: Record<WeaknessTag, Obs[]> = Object.fromEntries(WEAKNESS_TAGS.map((t) => [t, []])) as unknown as Record<WeaknessTag, Obs[]>;

  for (const e of essays) {
    const tags = new Set<WeaknessTag>(e.result.weaknessTags);
    e.result.corrections.forEach((c) => tags.add(c.tag));
    // 4観点は2点以下ならミスとみなす
    CRITERIA.forEach((c) => { if (e.result.scores[c] <= 2) tags.add(c); });
    for (const t of WEAKNESS_TAGS) {
      // 英作文1本ではどの弱点も観測できる（ミスがなければ「できた」1回）
      obs[t].push({ at: e.at, miss: tags.has(t) });
    }
  }
  for (const d of drills) obs[d.tag].push({ at: d.at, miss: !d.correct });

  const tags: TagStat[] = WEAKNESS_TAGS.map((tag): TagStat => {
    const list = [...obs[tag]].sort((a, b) => b.at.localeCompare(a.at)); // 新しい順
    const samples = list.length;
    if (samples === 0) return { tag, rate: 0, samples, enough: false, trend: "unknown" as const };
    let sum = 0, wsum = 0;
    list.slice(0, 20).forEach((o, i) => {
      const w = weightAt(i);
      sum += (o.miss ? 1 : 0) * w;
      wsum += w;
    });
    const rate = sum / wsum;

    let trend: TagStat["trend"] = "unknown";
    let recent: number | undefined, older: number | undefined;
    if (samples >= MIN_TAG_SAMPLES * 2) {
      const half = Math.floor(Math.min(samples, 20) / 2);
      recent = list.slice(0, half).filter((o) => o.miss).length / half;
      older  = list.slice(half, half * 2).filter((o) => o.miss).length / half;
      trend = recent < older - 0.15 ? "improving" : recent > older + 0.15 ? "worse" : "flat";
    }
    return { tag, rate: Math.round(rate * 100) / 100, samples, enough: samples >= MIN_TAG_SAMPLES, trend, older, recent };
  }).sort((a, b) => b.rate - a.rate);

  const weak = tags.filter((t) => t.enough && t.rate >= 0.4).slice(0, 3);
  const tentative = tags.filter((t) => !t.enough && t.samples > 0 && t.rate >= 0.5).slice(0, 3);

  let message: string;
  if (essays.length === 0 && drills.length === 0) {
    message = "まだ学習の記録がありません。英作文を1本書いてみましょう。";
  } else if (weak.length === 0 && tentative.length > 0) {
    message = "解答がまだ少ないので、苦手かどうかはまだ判断できません。もう少し続けてみましょう。";
  } else if (weak.length === 0) {
    message = essays.length < MIN_ESSAYS
      ? `英作文を${MIN_ESSAYS}本以上書くと、4観点の習熟度がわかります。`
      : "今のところ、はっきりした苦手は見つかっていません。この調子で続けましょう。";
  } else {
    message = "最近の結果から、特に練習したほうがよい分野を表示しています。";
  }

  return { essays: essays.length, mastery, tags, weak, tentative, message };
}
