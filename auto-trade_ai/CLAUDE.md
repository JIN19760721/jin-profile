# CLAUDE.md（auto-trade_ai）

このファイルは `auto-trade_ai/` 配下で作業する際にClaude Codeへ追加で読み込まれます。モノレポ全体の方針は `C:\claude\CLAUDE.md` を参照してください。

## プロジェクト概要

kabuステーション（auカブコム証券のデスクトップAPI）と連携した**日本株デイトレード自動売買システム**。旧`stock_ai/`の後継として作られ、現在はこちらが本番運用中のメインプロジェクトです。

`README.md`は初期の「候補銘柄抽出ツール」段階の説明のみで内容が古いままです。実際には `--trade` モードでkabuステーションAPI経由の発注・監視・決済まで自動化されており、実装の全体像は本ファイルと `docs/v2_design_phase0.md` を参照してください。

## 開発コマンド

```bash
cd auto-trade_ai

# セットアップ
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # API_PASSWORD等を設定する

# 候補銘柄スクリーニング（発注なし、CSV出力）
python -m src.main --exchange TP --top 30

# リアルタイムモニター（発注なし、ENTRY_SCOREを画面表示のみ）
python -m src.main --monitor

# 自動売買（本体）
python -m src.main --trade --dry-run   # ドライラン（発注シミュレーションのみ）
python -m src.main --trade             # 本番発注（実際に注文が出る）

# ウォッチリスト操作
python -m src.main --watch-add 7203 --memo "決算モメンタム"
python -m src.main --watch-add 7203 --held --entry-price 2500 --qty 100
python -m src.main --watch-remove 7203
python -m src.main --watch-list
python -m src.main --advise            # ウォッチリスト銘柄の買い時/売り時アドバイス（kabu API不要）

# ランキングアルゴリズムの検証
python scripts/validate_ranking.py --date 2026-07-08
# または /validate-ranking スラッシュコマンド

# テスト
.venv\Scripts\python.exe -m pytest tests/ -q
```

### 起動バッチ

| ファイル | 用途 |
|---|---|
| `run.bat` | スクリーナーを対話的に起動 |
| `run_monitor.bat` | リアルタイムモニターを起動（15:30に自動停止） |
| `run_trade.bat` | 自動売買を対話的に起動（dry-run/live選択、liveはYES確認あり） |
| `run_trade_auto.bat` | スケジューラ（`setup_scheduler.ps1`でタスク登録）からの無人起動用。引数`--live`でライブ、無指定でdry-run。ログは`logs/trade_YYYYMMDD.log`へ |

`run_trade_auto.bat` は取引所フィルタを `settings.yaml` の `trade.exchange` から取る（`--exchange`引数は`--trade`実行時には無視される）。

## アーキテクチャ

### 全体フロー（経路D / PRE_SURGE_SETUP、現行の主経路）

```
候補生成（kabuランキング type 1,6,7 + yfinance前日データ）
 ↓
08:50 Claude 寄り付き前フィルタ（premarket_llm_filter.py, フェイルオープン）
 ↓
08:57 kabuランキング寄り付き前スキャン
 ↓
リアルタイム surge_score（realtime_monitor.py, 5分足ベース）
 ↓
PRE_SURGE_SETUP 判定
 ↓
risk_manager.py（資金・件数・日次損失上限チェック）
 ↓
entry_policy.py（1H上昇トレンド判定）
 ↓
entry_llm_check.py（Claudeによるエントリー直前確認、フェイルオープン）
 ↓
order_manager.py（発注）
 ↓
position_tracker.py（保有中監視）
 ↓
固定%損切り / TAKE_PROFIT_LOCK / trailing / STALL_TIMEOUT / TIME_LIMIT / 15:00強制クローズ
```

### 主要モジュールの責務

| モジュール | 責務 |
|---|---|
| `trade_engine.py` | 全体のフロー制御。候補評価からエントリー判定・記録までを統括 |
| `config.py` | `.env`・`settings.yaml`の読み込み、Feature Flag、全定数 |
| `db.py` | SQLiteの全CRUD操作、スキーマ定義・マイグレーション |
| `kabu_client.py` | kabuステーション REST API クライアント |
| `ws_client.py` | kabuステーション WebSocket（リアルタイム価格） |
| `ranking_fetcher.py` / `screener.py` | ランキングAPI取得・スコアリング・候補統合 |
| `premarket_screener.py` / `premarket_llm_filter.py` | 寄り付き前の候補選定・Claudeフィルタ |
| `momentum_predictor.py` | 値動き予測系ロジック |
| `entry_policy.py` | 1H上昇トレンド等のENTRY可否ポリシー判定 |
| `entry_scorer.py` | 板情報ベースのエントリースコア（現状は`--monitor`専用、経路D未接続。Phase5で接続予定） |
| `entry_llm_check.py` | エントリー直前のClaude確認（経路D、1候補ずつ個別確認方式） |
| `risk_manager.py` | 資金・同時保有件数・日次損失上限の制御 |
| `order_manager.py` | 発注・約定確認・CLOSING状態管理 |
| `position_tracker.py` | 保有ポジションのEXIT監視（損切り/利確/trailing/STALL/TIME_LIMIT） |
| `indicator.py` | テクニカル指標計算 |
| `price_cache.py` | 1分足価格履歴のキャッシュ（surge_score計算用） |
| `notifier.py` | LINE通知の構築・送信 |
| `watch_advisor.py` | ウォッチリスト銘柄の買い時/売り時アドバイス（`--advise`） |
| `overnight_llm_advisor.py` | 翌日仕込み候補アドバイザー。強制クローズ検知時（`force_close_time`到達時、既定15:00）に当日の値動き・出来高・TDnet開示からClaudeが翌日候補を選びLINE通知するだけの助言専用機能。自動発注・自動EXITなし、売買判定フローとは完全独立。プロセスは`force_close_time`到達時に`SystemExit`で終了するため専用の実行時刻は持たず、強制クローズ検知に相乗りする形で実行される |
| `tdnet_fetcher.py` | TDnet適時開示の非公式スクレイピング（フェイルオープン） |
| `signal_repository.py`（Phase0） | `signal_history` / `candidate_outcomes`への記録専用。売買判定には使わない |
| `performance_analyzer.py`（Phase0） | Phase0観測データの成績集計（PF/MFE/MAE等） |
| `trade_plan.py`（Phase1, Shadow Mode） | STOP/TARGET/RR算出の純粋関数。DB非依存、どこからも売買判定に接続しない |
| `price_structure_fetch.py`（Phase1） | trade_plan用の補助データ取得（yfinanceの直近スイング安値/高値・前日高値・ATR、フェイルオープン+TTLキャッシュ） |
| `trade_plan_repository.py`（Phase1） | `trade_plans`への記録専用。売買判定には使わない |
| `scoring/` | スコアリング関連の補助モジュール群 |

### DBスキーマ概要（`data/trades.db`）

| テーブル | 内容 |
|---|---|
| `positions` | 実際の約定・EXIT履歴（損益、close_reason、entry_score等） |
| `orders` | 発注履歴（entry/exit問わず） |
| `watchlist` | ウォッチリスト銘柄（保有中/監視中） |
| `daily_summary` | 日次の取引件数・勝敗・損益集計 |
| `daily_candidates` | 日次の候補銘柄一覧とスコア |
| `signal_history`（Phase0観測専用） | シグナル状態遷移の全記録。売買判定には影響しない |
| `candidate_outcomes`（Phase0観測専用） | ENTRYしなかった候補も含む値動き追跡（MFE/MAE、5/10/15/30分後価格） |
| `performance_snapshots`（Phase0観測専用） | 日次/累計の集計結果 |
| `trade_plans`（Phase1観測専用, Shadow Mode） | 候補ごとのSTOP/TARGET/RR算出結果（`candidate_id`で`candidate_outcomes`と1:1対応、実際の値動きはJOINして参照する） |

`check_db.py`・`analyze_today.py` はDB内容を素早く確認するための補助スクリプト。

## V2設計とPhaseロードマップ

このシステムは `docs/v2_design_phase0.md`（V2.0設計書）に沿って段階的に改修が進行中です。

- **Phase0（実装済み）**: 現行ロジックを一切変更せず、`signal_history`/`candidate_outcomes`/`performance_snapshots`による観測基盤のみを追加。
- **Phase1（Shadow Modeのみ実装済み）**: ENTRY候補ごとにSTOP/TARGET/RRを算出し`trade_plans`テーブルに記録する（`src/trade_plan.py` + `src/price_structure_fetch.py` + `src/trade_plan_repository.py`）。`enable_phase1_trade_plan: true`で計算・記録はONだが、`enable_rr_filter: false`のまま＝rr_verdictはtrade_engine.pyのどこからも参照されず実際のENTRY判定には未接続（`tests/test_phase1_regression.py`で静的に保証）。
  - **2026-09-24時点の観測結果**: 実際にエントリーされた候補が全件RR<1.0（`NO_ENTRY`）だった一方、RR良好な候補は一件もエントリーされていなかった。原因はPRE_SURGE_SETUPでは直近抵抗線が現在値のすぐ近くにあり、TARGET候補として無条件採用するとRRを不当に悪化させていたため（`RR_MIN_TARGET_REWARD_PCT`の最低距離チェックで対処済み）。詳細は`docs/v2_design_phase0.md`のPhase1セクション参照。
  - Active化（RRでの実ブロック）は、この修正を踏まえてShadow Modeで数週間分のデータを再度蓄積し妥当性を検証してから判断する。全88件中35件（40%）がSTOP/TARGET到達ではなくSTALL_TIMEOUTで決済されている実態を踏まえると、**Phase1 Active化より先にPhase6（Rベース管理・STALL複合条件化）に着手する方がこのシステムの実態に合っている可能性が高い**。
- **Phase2〜7（未実装）**: entry_score_v2 → ENTRYパターン拡張 → 価格構造/VWAP → 時間帯/板/1H補正 → EXIT最適化（Rベース管理） → 地合い統合、の順で段階導入予定だが、上記の理由からPhase6を先に検討する余地がある。全機能は`settings.yaml`の`features:`配下でFeature Flag管理。

新しいPhaseの実装に着手する際は、必ず設計書の該当セクションと「§17 段階導入」（Shadow Mode → Active の順）、「§20 Claude Codeへの実装指示」を確認すること。**一度に複数Phase・複数patternを有効化しない。**

## settings.yaml の主要セクション

- `trade:` — 運用資金・最大保有数・損切り/利確ライン・利益ロック・STALL_TIMEOUT・強制クローズ時刻・日次損失上限など
- `surge:` — surge_scoreの閾値（STRONG/CANDIDATE/WATCH）
- `entry_policy:` — 1H移動平均によるENTRY可否判定のパラメータ
- `features:` — V2設計書のFeature Flag（Phase0のみtrue）

設定変更はコードを直接触らず、まず`settings.yaml`で試すこと。各パラメータにはコメントで変更理由・過去の検証結果が残っている場合が多いので、変更前に既存コメントを読むこと。

## 環境変数（`.env`）

| キー | 用途 | 必須 |
|---|---|---|
| `API_PASSWORD` | kabuステーション APIパスワード | 必須 |
| `ORDER_PASSWORD` | kabuステーション 取引注文パスワード（APIパスワードとは別） | `--trade`利用時必須 |
| `KABU_ENV` | `prod`=本番(18080) / `test`=検証(18081) | 必須 |
| `EXCHANGE_DIVISION` | デフォルト市場フィルタ | 任意 |
| `MIN_TRADING_VOLUME` | 最低出来高フィルタ | 任意 |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_USER_ID` | LINE通知 | 任意（未設定なら通知スキップ） |
| `ANTHROPIC_API_KEY` | 寄り付き前フィルタ・エントリー直前確認・`--advise`で使うClaude API | LLM機能を使う場合必須 |

## 注意点

- kabuステーション（デスクトップアプリ）が同一PC上で起動していないとAPI接続できない。
- 平日7:53〜9:10頃はランキングAPIが空を返すことがある（エラーではない）。
- `--trade`のlive実行は実際に発注される。dry-runとの取り違えに注意（`run_trade.bat`はlive選択時にYES確認あり、`run_trade_auto.bat`は`--live`引数の有無で自動判定するため事故りやすい）。
- Claude系の機能（寄り付き前フィルタ・エントリー直前確認・TDnet加味）は全てフェイルオープン設計＝失敗時は機能なしで処理続行する。
