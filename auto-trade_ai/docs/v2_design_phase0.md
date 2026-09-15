# 日本株デイトレード支援システム V2.0 設計書

**Phase 0（計測・検証基盤）を含む段階的改善設計**

- 対象：既存「経路D / PRE_SURGE_SETUP」ベースの自動分析・売買システム
- 作成日：2026年9月4日
- 設計原則：現行ロジックを壊さず、観測 → 検証 → 小さく変更 → フォワード検証
- 原本：`C:\Users\jinsa\Downloads\daytrade_system_design_v2_phase0_included.pdf`

---

## 0. エグゼクティブサマリー

本設計書は、現在のシステムを「急騰候補を見つける仕組み」から、「いつ買うか・どこで間違いと判断するか・どこまで取るかを期待値ベースで説明できるデイトレードシステム」へ段階的に進化させるための実装仕様である。

最初にPhase 0を置き、売買条件を一切変更せず、ENTRYした銘柄だけでなく見送った候補も構造化保存する。その後にRR、entry_score、新ENTRYパターン、EXIT最適化へ進む。

| Phase | 主目的 | 売買ロジック変更 | 主要成果物 |
|---|---|---|---|
| 0 | 現行の計測基盤 | なし | signal_history / candidate_outcomes / 基準成績 |
| 1 | ENTRY前のSTOP・TARGET・RR | 小 | trade_plan / RR filter |
| 2 | surge_scoreとentry_scoreの分離 | 中 | entry_score_v2 |
| 3 | ENTRYパターン拡張 | 中 | ORB / BREAKOUT / PULLBACK / VWAP_RECLAIM |
| 4 | 価格構造・VWAP強化 | 中 | HH/HL/LH/LL / VWAP状態判定 |
| 5 | 時間帯・板・1H補正 | 中 | time bucket / spread / orderbook |
| 6 | EXIT最適化 | 大 | Rベース管理 / STALL改善 / 分割利確 |
| 7 | 地合い・統合最適化 | 大 | market score / 継続的評価 |

### 0.1 分離する4つの概念

| 概念 | 意味 | 問い |
|---|---|---|
| surge_score | 銘柄が短時間で動きそうか | 監視すべきか？ |
| entry_score | 今この価格で入る質が高いか | 今買う価値があるか？ |
| risk_reward_ratio | 損失余地に対して利益余地が十分か | 割に合うENTRYか？ |
| exit_logic | ENTRY時の仮説が継続しているか | HOLD/利確/撤退のどれか？ |

---

## 1. 現行システムの前提

```
候補生成
 ↓
08:50 Claude 寄り付き前フィルタ（通知用）
 ↓
リアルタイム surge_score
 ↓
PRE_SURGE_SETUP
 ↓
risk_manager
 ↓
entry_policy（1H 上昇トレンド）
 ↓
Claude エントリ直前確認
 ↓
発注
 ↓
position_tracker
 ↓
固定%損切り / 利確 / trailing / STALL_TIMEOUT / TIME_LIMIT
```

### 1.1 既存モジュールの扱い

| モジュール | 現状役割 | V2での扱い |
|---|---|---|
| trade_engine.py | フロー制御 | 維持。新判定を接続する中心 |
| surge_score.py | 急騰予兆スコア | 維持。entry_scoreと役割分離 |
| position_tracker.py | 保有中EXIT | Phase6で拡張 |
| entry_scorer.py | 板スコア（手動monitor） | Phase5で経路Dへ接続 |
| risk_manager | 資金・件数・損失制御 | 維持 |
| entry_policy | 1Hトレンド等 | Phase5で重み付け方式を検証 |
| settings.yaml / config.py | 設定管理 | 全新機能をFeature Flag化 |
| positions | 約定後データ保存 | Phase0から分析項目拡張 |

### 1.2 現状の主要ギャップ

- ENTRY前にstop_price / target_price / RRを決めていない。
- surge_scoreが「動きそう」と「今買うべき」を兼ねている。
- ENTRYパターンがPRE_SURGE_SETUPの1種類のみ。
- VWAPが上/下の二値で、距離・奪回・維持・拒否を見ていない。
- 高値・安値の切り上げ／切り下げを評価していない。
- 時間帯ごとの期待値差をルールへ未反映。
- 板スコアは存在するが主経路Dに未接続。
- EXITが固定%中心で、価格構造・ATR・R倍率との連動が弱い。
- 見送った候補のその後を体系的に追跡していない。
- シグナル履歴がログ中心で、SQL分析可能な構造化保存になっていない。

---

## 2. 設計原則

- **P1 現行優位性の保護**：PRE_SURGE_SETUPと経路Dを残し、新機能はFeature Flagで段階導入する。
- **P2 観測と売買を分離**：Phase0では記録・集計だけを追加し、ENTRY/EXIT結果を変えない。
- **P3 シグナルと注文を分離**：候補、ENTRY適格、注文可能、発注済みを別状態として扱う。
- **P4 説明可能性**：各判定はreason / warning / no_entry_reasonを返す。
- **P5 フォールバック**：価格構造等が取得できない時は現行固定%へ戻せる。
- **P6 回帰可能性**：各Phaseで旧ロジックと新ロジックを同入力で比較できる。
- **P7 データ駆動**：時間帯・1H・RR等の閾値は履歴から調整する。

---

## 3. Phase 0 - 現行ロジックの計測・検証基盤（実装済み）

目的は「現行システムを変えずに、今後の変更効果を正確に測れる状態を作る」こと。売買条件・発注条件・EXIT条件は変更しない。

### 3.1 完了条件

- 同一入力に対するENTRY可否、surge_score、PRE_SURGE_SETUP、注文数量、EXIT判定が導入前後で一致する。
- ENTRYしなかった候補を含め、シグナル状態遷移をDBで追跡できる。
- 候補発生後5/10/15/30分の値動きとMFE/MAEを集計できる。
- 時間帯別、surge_score帯別、Claude判定別、exit_reason別の成績を即時確認できる。
- 固定-2% / +5%が実際の価格挙動に適しているか評価できる。
- 以降の新機能をFeature FlagでOFFのまま準備できる。

### 3.2 新規データ構造

| テーブル | 目的 | 主要キー |
|---|---|---|
| signal_history | シグナル状態遷移 | id, symbol, timestamp |
| candidate_outcomes | 見送りを含む候補後の値動き | candidate_id, symbol, signal_time |
| performance_snapshots | 日次/累計の集計結果 | date, strategy_version |

### 3.3 signal_history 推奨カラム

| カラム | 型 | 説明 |
|---|---|---|
| timestamp | datetime | 判定時刻 |
| symbol | text | 銘柄コード |
| price | real | 判定時価格 |
| previous_signal | text | 直前状態 |
| current_signal | text | 現在状態 |
| surge_score | real | 急騰スコア |
| surge_state | text | WATCH/PRE_SURGE等 |
| surge_reason | text/json | 理由 |
| vwap | real | VWAP |
| volume_spike_ratio | real | 出来高倍率 |
| turnover_spike_ratio | real | 売買代金倍率 |
| near_day_high_ratio | real | 高値接近率 |
| one_hour_trend | text | 1H状態 |
| claude_result | text | OK/NG/未判定 |
| claude_reason | text | Claude理由 |
| entry_allowed | bool | 最終ENTRY可否 |
| no_entry_reason | text/json | 見送り理由 |
| strategy_version | text | ロジックバージョン |

### 3.4 candidate_outcomes 推奨カラム

| カラム | 型 | 説明 |
|---|---|---|
| candidate_id | text | 候補識別子 |
| symbol | text | 銘柄コード |
| signal_time | datetime | 候補発生時刻 |
| signal_price | real | 候補発生価格 |
| signal_type | text | PRE_SURGE_SETUP等 |
| entered | bool | 実際にENTRYしたか |
| no_entry_reason | text/json | 見送り理由 |
| price_after_5m | real | 5分後 |
| price_after_10m | real | 10分後 |
| price_after_15m | real | 15分後 |
| price_after_30m | real | 30分後 |
| max_price | real | 追跡期間中最高値 |
| min_price | real | 追跡期間中最安値 |
| max_upside_pct | real | 最大上昇率 |
| max_downside_pct | real | 最大下落率 |
| mfe_pct | real | 最大有利変動 |
| mae_pct | real | 最大不利変動 |
| first_touch | text | SL/TP候補の先着 |

### 3.5 Phase0 自動集計

- 取引件数、勝率、合計損益、平均利益、平均損失、Profit Factor、最大利益、最大損失。
- 最大連勝・最大連敗、平均保有時間、exit_reason別件数・損益。
- 時間帯別：09:05-09:30 / 09:30-10:30 / 10:30-11:30 / 12:30-13:00 / 13:00-14:00 / 14:00-15:20。
- surge_score帯別：70-79 / 80-84 / 85-89 / 90-94 / 95-100。
- Claude OK/NG別。NG候補のその後のMFE/MAEも追跡する。
- 1Hトレンド別：上昇・横ばい・下降の期待値比較。
- 固定-2% / +5%に対し、-0.5/-1/-1.5/-2%と+1/+2/+3/+4/+5%の到達率・先着率。

### 3.6 Feature Flag

```yaml
features:
  enable_phase0_observability: true
  enable_rr_filter: false
  enable_entry_score_v2: false
  enable_opening_range: false
  enable_breakout_pattern: false
  enable_pullback_pattern: false
  enable_vwap_reclaim: false
  enable_price_structure: false
  enable_time_bucket_filter: false
  enable_orderbook_filter: false
  enable_r_based_exit: false
  enable_partial_take_profit: false
  enable_market_filter: false
```

### 3.7 Phase0 テスト

- 回帰テスト：導入前後でENTRY/EXIT結果が完全一致。
- DBテスト：状態変化時にsignal_historyが1件追加される。
- 重複防止：同一状態の不要な重複保存を防ぐ。
- 候補追跡：ENTRYしなくてもcandidate_outcomesが更新される。
- 昼休みをまたぐ候補追跡を正しく扱う。

---

## 4. Phase 1 - ENTRY前 Trade Plan / STOP / TARGET / RR（未実装）

```
ENTRY候補
 ↓
entry_price 推定
 ↓
stop candidates 生成
 ↓
target candidates 生成
 ↓
trade_plan 生成
 ↓
RR 判定
 ↓
risk_manager / entry_policy / Claude
 ↓
発注
```

| 項目 | 説明 |
|---|---|
| entry_price | 発注想定価格 |
| stop_price | 初期損切り価格 |
| stop_reason | 価格構造/ATR/fallback |
| target_price | 第1目標 |
| target_reason | 抵抗線/ATR/R倍率/fallback |
| risk_per_share | entry-stop |
| reward_per_share | target-entry |
| risk_reward_ratio | reward/risk |

### 4.1 STOP候補の優先順位

1. 直近スイング安値
2. ブレイクライン
3. VWAP
4. 前日高値
5. ATR
6. 最後に固定-2%フォールバック

### 4.2 TARGET候補の優先順位

1. 直近上値抵抗線
2. 当日高値・前日高値
3. ATR到達可能範囲
4. 最低R倍率から逆算
5. 最後に固定+5%フォールバック

### 4.3 初期RRルール

| RR | 初期判定 |
|---|---|
| <1.0 | NO_ENTRY |
| 1.0-1.49 | 原則NO_ENTRY |
| 1.5-1.99 | WATCH/減点 |
| >=2.0 | 高評価 |

---

## 5. Phase 2 - entry_score_v2（未実装）

surge_scoreを候補発見専用として残し、entry_score_v2を「今この価格で入る質」の評価に限定する。

| 要素 | 初期配点例 |
|---|---|
| surge_quality | 15 |
| VWAP状態 | 10 |
| 価格構造 | 10 |
| ブレイク品質 | 10 |
| 出来高継続 | 10 |
| RR | 15 |
| スプレッド/板 | 10 |
| 時間帯 | 10 |
| 1Hトレンド | 5 |
| 過熱/抵抗線 | 5 |

初期閾値：85以上=ENTRY候補、70-84=WATCH、70未満=NO_ENTRY。まずshadow modeで算出し、発注には使わない。

---

## 6. Phase 3 - ENTRYパターン拡張（未実装）

| pattern_id | 概要 | 主条件 |
|---|---|---|
| PRE_SURGE_SETUP | 出来高先行・価格未動 | 既存維持 |
| OPENING_RANGE_BREAKOUT | 寄り後レンジ上抜け | OR高値突破+出来高+VWAP+RR |
| BREAKOUT | 重要高値突破 | 出来高+スプレッド+RR |
| PULLBACK | 上昇トレンド中の押し目 | 支持帯+HL+出来高回復 |
| VWAP_RECLAIM | VWAP再奪回 | 下→上+維持+出来高+HH |

Opening Range初期仕様は寄り付き後10分または最初の2本の5分足。銘柄ごとの実際の寄り付き時刻を基準にする。

---

## 7. Phase 4 - 価格構造・VWAP状態（未実装）

```
higher_high / higher_low
lower_high / lower_low
trend_structure = UP / DOWN / RANGE / UNKNOWN
```

| VWAP指標 | 意味 |
|---|---|
| vwap_distance_pct | VWAP乖離率 |
| vwap_cross_direction | 上抜け/下抜け |
| vwap_reclaim | 下から再奪回 |
| vwap_hold | 奪回後に維持 |
| vwap_rejection | 上抜け失敗/反落 |
| vwap_overextended | VWAPから離れすぎ |

---

## 8. Phase 5 - 時間帯・板・1H補正（未実装）

| time_bucket | 方針 |
|---|---|
| 09:00-09:05 | ENTRY禁止推奨 |
| 09:05-09:30 | 最重要 |
| 09:30-10:30 | トレンド継続/ブレイク |
| 10:30-11:30 | 厳格化 |
| 12:30-13:00 | 後場再評価 |
| 13:00-14:00 | 厳格化 |
| 14:00-15:20 | 大引け資金流入を別係数評価 |

板はentry_scorer.pyの買い優勢度・インバランス・スプレッドを経路Dへ接続。板単独ENTRYは禁止。

```
spread_pct = (ask - bid) / ((ask + bid) / 2) * 100
```

1H下降=強制NGは直ちに削除せず、Phase0データで上昇/横ばい/下降別のPFと平均損益を比較し、必要なら加減点方式へ変更する。

---

## 9. Phase 6 - EXIT最適化（未実装）

STALL_TIMEOUTは維持し、経過時間+高値更新失敗+出来高減衰+VWAP位置+MFEの複合条件へ拡張する。

```
initial_risk = entry_price - initial_stop_price
current_R = (current_price - entry_price) / initial_risk

+1.0R -> 建値付近へSTOP引上げ候補
+1.5R -> 部分利確候補
+2.0R -> 直近5分足安値 / ATRへSTOP引上げ
>2.0R -> trailing
```

分割利確は構造だけ先に対応し、初期はOFF。300株なら1.5Rで100株、2Rで100株、残りをtrailなど。

---

## 10. Phase 7 - 地合い統合最適化（未実装）

個別ENTRY/EXITが安定した後で日経平均、TOPIX、グロース市場指数等をmarket_score化し、entry_scoreを補正する。地合い単独でENTRY禁止にはしない。

---

## 11. V2全体フロー

```
候補生成
 ↓
08:50 Claude 寄り前フィルタ
 ↓
surge_score ───→ signal_history / candidate_outcomes
 ↓
ENTRY pattern detector
 ↓
trade_plan(entry/stop/target/RR)
 ↓
entry_score_v2
 ↓
hard NO_ENTRY filters
 ↓
risk_manager
 ↓
entry_policy / time / 1H / orderbook
 ↓
Claude 直前確認
 ↓
注文
 ↓
position_tracker
 ↓
HOLD / STALL / STOP / TAKE_PROFIT / TRAIL / TIME_LIMIT
 ↓
performance aggregation
```

---

## 12. データ設計

### 12.1 positions 追加推奨項目

| カラム | 説明 |
|---|---|
| strategy_version | V1/V2.x |
| entry_pattern | ENTRY戦略ID |
| entry_score_v2 | ENTRY品質 |
| entry_vwap | ENTRY時VWAP |
| entry_vwap_distance_pct | VWAP乖離率 |
| entry_spread_pct | スプレッド |
| stop_price_initial | 初期STOP |
| stop_reason | STOP根拠 |
| target_price_initial | 初期TARGET |
| target_reason | TARGET根拠 |
| initial_risk | 1株初期リスク |
| risk_reward_ratio | 初期RR |
| max_favorable_excursion | MFE |
| max_adverse_excursion | MAE |
| r_multiple | 最終R |
| time_bucket | ENTRY時間帯 |
| pre_claude_signal | Claude前判定 |
| claude_result | OK/NG |
| claude_reason | 理由 |

### 12.2 マイグレーション方針

- 既存positionsを破壊しないmigration方式。
- 新規カラムはNULL許容で後方互換。
- Feature Flag OFFなら既存動作可能。
- strategy_versionで旧新データを混在分析可能。

---

## 13. settings.yaml 設計例

```yaml
features:
  enable_phase0_observability: true
  enable_rr_filter: false
  enable_entry_score_v2: false
  enable_opening_range: false
  enable_breakout_pattern: false
  enable_pullback_pattern: false
  enable_vwap_reclaim: false
  enable_price_structure: false
  enable_time_bucket_filter: false
  enable_orderbook_filter: false
  enable_r_based_exit: false
  enable_partial_take_profit: false
  enable_market_filter: false

risk_reward:
  min_rr_hard: 1.0
  min_rr_watch: 1.5
  preferred_rr: 2.0
  fallback_stop_pct: 2.0
  fallback_target_pct: 5.0
```

---

## 14. 推奨モジュール構成

| モジュール | 責務 |
|---|---|
| surge_score.py | 急騰候補評価。既存維持 |
| trade_plan.py（新規推奨） | entry/stop/target/RR生成 |
| entry_score_v2.py（新規推奨） | ENTRY品質スコア |
| entry_patterns.py（新規推奨） | 各ENTRY pattern |
| price_structure.py（新規推奨） | HH/HL/LH/LL・VWAP状態 |
| signal_repository.py（新規推奨） | signal_history/candidate_outcomes保存 |
| performance_analyzer.py（新規推奨） | PF/R/MFE/MAE等集計 |
| position_tracker.py | EXIT。Phase6で拡張 |
| trade_engine.py | フロー統合。詳細ロジックは持たせない |

---

## 15. 統一判定出力

```json
{
  "symbol": "1234",
  "price": 211.0,
  "surge_score": 88,
  "surge_state": "PRE_SURGE_SETUP",
  "entry_pattern": "PRE_SURGE_SETUP",
  "entry_score": 86,
  "trade_plan": {
    "entry_price": 211.0,
    "stop_price": 207.0,
    "stop_reason": "recent_swing_low",
    "target_price": 219.0,
    "target_reason": "2R_and_resistance",
    "risk_reward_ratio": 2.0
  },
  "decision": "ENTRY",
  "reasons": ["volume_persistence", "above_vwap", "higher_low", "rr_2.0"],
  "warnings": [],
  "no_entry_reasons": []
}
```

---

## 16. テスト戦略

| テスト | 内容 |
|---|---|
| test_phase0_regression.py | Phase0前後で売買結果同一 |
| test_signal_history.py | 状態遷移・重複防止 |
| test_candidate_outcomes.py | 見送り候補追跡 |
| test_trade_plan.py | STOP/TARGET/fallback |
| test_risk_reward.py | RR計算・境界値 |
| test_entry_score_v2.py | 配点・閾値・理由 |
| test_entry_patterns.py | 各pattern成立/不成立 |
| test_opening_range.py | 寄り時刻・レンジ |
| test_vwap_logic.py | 奪回/維持/拒否/乖離 |
| test_price_structure.py | HH/HL/LH/LL |
| test_no_entry.py | 強制NO_ENTRY優先順位 |
| test_stop_loss.py | 初期STOP・引上げ |
| test_take_profit.py | 固定/R/分割 |
| test_stall_timeout.py | 複合STALL |

境界値例：
- RR: 0.99 / 1.00 / 1.49 / 1.50 / 1.99 / 2.00
- entry_score: 69 / 70 / 84 / 85
- time: 09:04:59 / 09:05:00 / 09:29:59 / 09:30:00

---

## 17. 段階導入

| 段階 | 本番設定 | 検証 |
|---|---|---|
| Phase0 | 観測のみON | 現行基準値・回帰確認 |
| Phase1 Shadow | RR計算ON/filter OFF | 仮見送りと結果を記録 |
| Phase1 Active | RR filter ON | 旧ロジックとの差分評価 |
| Phase2 Shadow | entry_score算出/発注影響なし | score帯別期待値 |
| Phase2 Active | entry_score filter ON | PFと機会損失比較 |
| Phase3以降 | pattern単位に個別ON | 一度に複数patternをONにしない |

Shadow Modeは「計算するが発注判断には使わない」方式。新フィルターが損失を何件防ぎ、利益を何件捨てるかを本番データで検証できる。

---

## 18. 成功指標（KPI）

| KPI | 目的 |
|---|---|
| Profit Factor | 利益総額/損失総額 |
| 平均R | 価格帯を跨いだ共通尺度 |
| MFE/MAE | EXIT/STOP適切性 |
| ENTRY件数 | 厳しすぎないか |
| 機会損失率 | 見送り後に上昇した割合 |
| 損失回避率 | 見送り後に下落した割合 |
| pattern別PF | ENTRYパターンの優位性 |
| time_bucket別PF | 時間帯差 |
| Claude付加価値 | 防いだ損失と捨てた利益の比較 |

---

## 19. Claude判定の位置づけ

Claudeはブラックボックスの最終判定にせず、Claude前後の機械判定を保存し、反実仮想比較を可能にする。

| 項目 | 説明 |
|---|---|
| pre_claude_signal | Claude前機械判定 |
| pre_claude_score | Claude前entry_score |
| claude_result | OK/NG |
| claude_reason | 理由 |
| post_claude_signal | Claude後最終判定 |
| candidate_outcome | NG後も価格追跡 |

---

## 20. Claude Codeへの実装指示（原文）

この設計書をV2.0実装仕様として扱う。

最初に既存コードを調査し、設計書の想定と実装の差分を整理する。
いきなりPhase1以降をしない。最初の作業対象はPhase0のみ。

Phase0では、現在の経路D、surge_score、PRE_SURGE_SETUP、risk_manager、entry_policy、Claude確認、発注、EXITロジックの判定結果を一切変更しない。

実施順序：
1. 現在のディレクトリ・DB・settings.yaml・テストを調査
2. Phase0の実装マッピングを提示
3. DBマイグレーション方針を提示
4. 回帰テストを先に追加
5. signal_history / candidate_outcomes / performance集計を実装
6. Feature Flag / strategy_versionを実装
7. 既存ロジックが変わっていないことをテスト
8. 現行履歴から取得可能な基準成績を出力
9. Phase1へ進む前の不足データ・リスクを報告

重要：
- Phase0では新しい売買条件を有効化しない
- 既存コードを大規模に書き換えない
- 新規DBカラムは後方互換性を確保
- 取得不能な指標は推測せず「取得不能」と理由を報告
- ENTRYしなかった候補も追跡
- 各判定理由を構造化保存

Phase0完了後は次に進まず、以下を報告：
- 変更ファイル
- DB変更
- 追加設定
- テスト結果
- 基準成績
- surge_score別成績
- 時間別成績
- Claude OK/NG比較
- 固定-2%/+5%到達率
- Phase1前の推奨変更

---

## 21. Phase別完了チェックリスト

### Phase 0（実装済み）
- [x] 売買結果不変
- [x] signal_history
- [x] 見送り追跡
- [x] MFE/MAE
- [x] 基準成績
- [x] Feature Flag

### Phase 1（Shadow Modeのみ実装済み。enable_rr_filterはfalseのまま＝Active化は未実施）
- [x] trade_plan（`src/trade_plan.py`）
- [x] STOP/TARGET理由（フル優先順位: スイング安値/高値→VWAP→前日高値→ATR→固定%。ブレイクラインはPRE_SURGE_SETUPに概念上馴染まないため未実装、Phase3のBREAKOUT導入時に検討）
- [x] RR（`trade_plans`テーブル、`positions`/`orders`にもスナップショット）
- [x] fallback（価格構造データ取得不能時は既存の固定-2%/+5%へ自動フォールバック）
- [x] shadow mode（`enable_phase1_trade_plan: true` / `enable_rr_filter: false`、rr_verdictはtrade_engine.pyのどこからも参照されず売買判定に不接続。静的回帰テスト`test_phase1_regression.py`で保証）

### Phase 2
- [ ] entry_score_v2
- [ ] surge_score分離
- [ ] score帯分析

### Phase 3
- [ ] 5 pattern
- [ ] entry_pattern保存
- [ ] pattern別PF

### Phase 4
- [ ] HH/HL/LH/LL
- [ ] VWAP状態
- [ ] 過熱判定

### Phase 5
- [ ] time bucket
- [ ] spread
- [ ] 板接続
- [ ] 1H検証

### Phase 6
- [ ] R管理
- [ ] STALL複合化
- [ ] 分割利確構造

### Phase 7
- [ ] market_score
- [ ] 地合い補正
- [ ] 統合レポート

---

## 22. 最終到達点

各トレードについて「なぜ候補になったか」「なぜ今ENTRYしたか」「どこでシナリオ崩壊か」「なぜこの利確/損切りか」をデータとして後から説明でき、旧ロジックとの差分を再現・検証できる状態をV2の完成条件とする。

**優先順位：Phase 0完成 → 現行基準値確認 → Phase 1をShadow Modeで計測 → 有効性確認後に発注へ反映。**
