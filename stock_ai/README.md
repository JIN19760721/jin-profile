# 日本株 注目銘柄 自動抽出ツール

J-Quants（銘柄マスタ）と yfinance（日次株価）を組み合わせ、日本株の全銘柄データを取得・分析して注目銘柄を Excel に出力するツールです。

## 必要な API キー

### J-Quants（銘柄マスタ取得に使用）

- [J-Quants](https://jpx-jquants.com/) でアカウント登録（無料プランで利用可能）
- ダッシュボードで API キーを発行し `.env` に設定

### yfinance（日次株価取得に使用）

- yfinance は API キー不要で利用できます

---

## セットアップ

### 1. Python 環境の準備

```bash
cd stock_ai
python -m venv .venv

# Windows
.venv\Scripts\activate

# Mac/Linux
source .venv/bin/activate
```

### 2. ライブラリのインストール

```bash
pip install -r requirements.txt
```

### 3. .env ファイルの作成

`.env.example` をコピーして `.env` を作成し、J-Quants の API キーを入力します。

```env
JQUANTS_API_KEY=your_api_key_here
```

---

## 実行方法

### 通常実行（当日〜直近 30 日分を取得して分析）

```bash
python main.py
```

### データ取得期間を変更して実行

```bash
python main.py --period 60d
```

### 特定日を指定して分析

```bash
python main.py --date 2026-06-15
```

### データ取得をスキップして分析のみ実行

（すでに DB にデータがある場合）

```bash
python main.py --skip-fetch
```

---

## Windows GUI（ブラウザ操作パネル）

CLI のオプションを覚えなくても、ブラウザから注目銘柄ランキング作成・LINE通知・5分足監視・日次レポート・バックテストなどを操作できる Streamlit 製 GUI です。既存の分析・監視ロジック（analyze.py / trade_decision.py / intraday_monitor.py 等）は変更せず、内部では同じ main.py / 各モジュールを呼び出しています。**自動売買機能は含まれません（表示・通知・手動操作のみ）。**

### 起動方法

```bash
# ライブラリインストール済みなら、stock_ai フォルダで run_gui.bat をダブルクリック
run_gui.bat
```

または手動で：

```bash
cd stock_ai
streamlit run app.py
```

起動するとブラウザで `http://localhost:8501` が自動的に開きます。

`run_gui.bat` はStreamlit起動前に、LINE Webhook サーバー（`python line_webhook.py`、
ポート5000）も別ウィンドウで自動起動します。外部公開用の ngrok トンネル
（`ngrok http 5000`）は自動起動されないため、LINE Webhookを使う場合は別途
手動で起動してください（後述「LINE で銘柄を登録して監視する」参照）。

### 画面でできること

- サイドバー: 監視銘柄コード入力、entry_mode 選択、ランキング通知件数（チェックなしなら抽出された全銘柄を通知。CLIの`--ranking-top`省略時と同じ動作）、自動更新ON/OFF・間隔
- 操作ボタン: ランキング作成 / ランキングをLINE通知 / 5分足監視実行 / 日次レポート作成 / バックテスト実行 / watchlist登録
- 表示タブ: 最新ランキング、watchlist、5分足データ＋チャート（終値・VWAP・entry_price・atr_stop_price）、デイトレ判定一覧、BUY/WAIT/SELL（DBの`final_action`をそのまま表示。GUI側での再判定は行わない）、日次レポート、settings.yaml の主要設定

---

## ランキング通知（LINE）

`--notify-ranking` を付けると、分析（データ取得 → スコアリング → watchlist登録 → Excel 出力）
完了後に注目銘柄ランキングを LINE に自動送信します。デフォルトでは抽出された全銘柄を通知します。

また、分析で抽出された銘柄は `--notify-ranking` の指定に関わらず、毎回デフォルトで
watchlist に登録されます（既存の watchlist は置き換わります）。

```bash
# 分析してデフォルト（抽出された全銘柄）を通知
python main.py --notify-ranking

# 件数を指定して通知（上位N件のみ）
python main.py --notify-ranking --ranking-top 5

# データ取得をスキップして分析 + 通知
python main.py --skip-fetch --notify-ranking
```

**注意:**
- LINE 通知には `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_USER_ID` が必要です（未設定時はログのみ）
- `--ranking-top` を指定する場合は最大 20 件までです（省略時は件数制限なし）
- 通知失敗時もメイン処理（分析・watchlist登録・Excel 出力）には影響しません

通知文の例:

```
【本日の注目銘柄ランキング】
2026-06-17

1位 3778 さくらインターネット
株価：4,200円
前日比：+8.5%
出来高急増：3.2倍
スコア：92
理由：出来高急増、前日高値突破

2位 7203 トヨタ自動車
株価：2,850円
前日比：+3.4%
出来高急増：2.1倍
スコア：81
理由：VWAP上、出来高増加
```

---

## ランキング検証

過去の注目銘柄ランキングが実際に翌営業日も有効だったかを検証します。
`analysis_results` の指定日のランキング銘柄について翌営業日の株価推移
（始値・高値・安値・終値）を取得し、`HIT`/`GOOD`/`OK`/`BAD`/`NEUTRAL` で評価します。

```bash
python main.py --validate-ranking --date 2026-06-15
```

**判定基準:**
- `max_gain_pct`（翌日高値が翌日始値から何%上昇したか）が +5% 以上 → `HIT`
- `max_gain_pct` が +3% 以上 → `GOOD`
- `close_return_pct`（翌日終値が翌日始値から何%変化したか）が 0% より大きい → `OK`
- `max_drawdown_pct`（翌日安値が翌日始値から何%下落したか）が -3% 以下 → `BAD`
- それ以外 → `NEUTRAL`

**注意:**
- `daily_quotes` に翌営業日のデータがあればそれを使い、なければ yfinance から直接取得します
- yfinance でも取得できない銘柄はスキップします
- 既存の注目銘柄ランキング抽出・通知機能（`analyze.py` / `ranking_notifier.py`）は変更しません
- 自動売買は行いません。出力先は `excel/ranking_validation_{対象日}.xlsx`（シート名: 「ランキング検証」）です

---

## LINE で銘柄を登録して監視する（Webhook）

ランキング通知を受け取った後、LINE に銘柄コードを返信するだけで
5分足監視の対象銘柄（watchlist）を登録できます。**自動売買は行いません。**

### 対応メッセージ形式

```
監視 7203 3778
watch 7203 3778
7203 3778
7203,3778
```

- 4桁数字のみ抽出（重複除外）
- 最大5銘柄。超過時はエラー返信
- 本日の注目銘柄ランキングに含まれる銘柄のみ登録可能（ランキング外は登録せず返信）
- `python main.py` 実行時に抽出された注目銘柄が watchlist に自動登録されますが、
  watchlist の active（is_active=1）は常に最大5件に制限されます（`register_watchlist()`
  が書き込み時に先頭5件へ切り捨て、`get_active_watchlist()` も読み取り時に5件まで
  制限する二重のガードがあります）。Webhook 経由の手動登録はその日のうちに次回の
  `main.py` 実行で上書きされます
- 登録すると既存の watchlist は全て無効化（is_active=0）されてから新規登録される

### LINE 返信例

**正常時:**
```
監視対象を登録しました。
7203 トヨタ自動車
3778 さくらインターネット

次回の5分足監視から対象になります。
```

**件数超過:**
```
監視対象は最大5銘柄までです。
```

**ランキング外:**
```
以下は本日の注目銘柄ランキング外のため登録しませんでした。
9999
```

### Webhook サーバーの設定

#### 1. .env に追加

```env
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_USER_ID=your_line_user_id
```

`LINE_CHANNEL_SECRET` は LINE Developers のチャネル基本設定で確認できます。

#### 2. Flask サーバーを起動

```bash
python line_webhook.py
```

（`run_gui.bat` でGUIを起動した場合は、このステップは自動実行されます）

#### 3. ngrok で外部公開（ローカル開発時）

```bash
ngrok http 5000
```

ngrok が発行した URL（例: `https://xxxxx.ngrok-free.app`）を
LINE Developers の「Messaging API 設定」→「Webhook URL」に設定します。

```
https://xxxxx.ngrok-free.app/callback
```

「Webhook の利用」を ON にして「検証」ボタンで疎通確認してください。

#### 4. watchlist 確認後に監視実行

```bash
# watchlist から自動取得して監視（--codes 不要）
python main.py --intraday --entry-mode manual

# 従来通り --codes で直接指定も可能
python main.py --intraday --codes 7203 3778 --entry-mode manual
```

> **セキュリティ注意:** 本番利用時は `.env` に `LINE_CHANNEL_SECRET` を設定し、
> Webhook の署名検証を有効にしてください。未設定時は検証をスキップするため、
> 第三者からのリクエストを受け入れてしまいます。

### watchlist をクリアする

watchlist の active 件数が想定外に増えた場合や、監視対象をいったん空にしたい場合は
以下のコマンドで全エントリーを無効化（`is_active=0`）できます。

```bash
python main.py --clear-watchlist
```

実行すると `UPDATE watchlist SET is_active = 0` が行われ、`get_active_watchlist()` は
空リストを返すようになります。次回の `--intraday` 実行時は watchlist が空のため、
注目銘柄ランキング上位5件への自動フォールバックが使われます（後述）。

---

## 5分足デイトレ判定（イントラデイ監視）

指定銘柄（最大5件）の5分足を取得し、エントリー価格に対する損益率や VWAP・前日高安・
寄り付き30分レンジ・出来高・ATR などを用いたデイトレ判定（STAY/WATCH/WATCH_STRONG/
TAKE_PROFIT/STOP_LOSS/ENTRY）を行います。注目銘柄ランキング機能とは独立した、別コマンドの実行系です。

```bash
# エントリー価格を当日最初の5分足終値とする場合
python main.py --intraday --codes 7203 3778 --entry-mode first_close

# entry_prices.csv（code,entry_price）から買値を読み込む場合
python main.py --intraday --codes 7203 3778 --entry-mode manual

# watchlist に登録済みの銘柄を自動取得して監視する場合（--codes 省略可）
python main.py --intraday --entry-mode manual

# シグナル変化時にLINE Notifyへ通知する場合（--notify-line を付与）
python main.py --intraday --codes 7203 3778 --entry-mode manual --notify-line
```

- `--codes`: 対象銘柄コード（4桁数字、最大5件、超過分は切り捨て）
- `--entry-mode`: `first_close`（デフォルト）または `manual`
- `--notify-line`: 付与した場合のみ LINE へ通知する（未指定時はログ出力のみ）
- 結果は `data/stocks.db` の `intraday_prices` / `intraday_positions` / `trade_signals` /
  `signal_history` / `entry_candidate_history` / `final_action_history` テーブルと、
  `excel/intraday_prices_YYYY-MM-DD_HHMM.xlsx`
  （5分足データ・損益計算・デイトレ判定・シグナル変化履歴・買い候補変化履歴・
  売買判断変化履歴の各シート）に出力されます

### 監視対象の選定優先順位

`--intraday` の対象銘柄は以下の優先順位で決まります（`main.py` の `run_intraday_mode()`）。

1. `--codes` が指定されていればそれを使う
2. 未指定なら watchlist（`is_active=1`、最大5件）を使う
3. watchlist も空なら、注目銘柄ランキング（`analysis_results`）の `rank` 昇順で上位5件を使う（`watchlist.get_top_ranked_codes(limit=5)`）
4. それも取得できなければ（ランキングデータなし）エラー終了する

**3のランキングフォールバックは一時的な対象選定のみで、watchlist には保存されません**
（`get_top_ranked_codes()` は読み取り専用で、その回の `--intraday` 実行が終われば消えます）。
watchlist に永続登録されるのは、LINE Webhook 経由の手動登録（`source=LINE`）と
`python main.py` 実行後の自動登録（`source=RANKING`、抽出された注目銘柄。ただし
active は常に最大5件に制限）だけです。Streamlit GUI（`app.py`）の「5分足監視実行」
ボタンも内部的に同じ `main.py --intraday` を呼ぶため、この優先順位がそのまま適用されます。

### signal / entry_candidate / final_action の違い

このツールは3つの独立した判定値を持ちます。**いずれも自動売買ではなく、判断支援のための表示・通知のみです。**

| 判定値 | 役割 | 値 | 通知条件 |
|---|---|---|---|
| `signal` | 損益率・VWAP・前日高安・出来高・ATR等から決まる本体のデイトレ判定 | `STAY` / `WATCH` / `WATCH_STRONG` / `TAKE_PROFIT` / `STOP_LOSS` / `ENTRY`（初回監視開始） | `signal_history.changed_flag=True` かつ `ENTRY/WATCH/WATCH_STRONG/TAKE_PROFIT/STOP_LOSS` への変化時 |
| `entry_candidate` | ENTRY_SCORE（VWAP上/前日高値ブレイク/出来高急増継続/ランキング等の加点）に基づく買いエントリー候補判定 | `ENTRY` / `WATCH` / `NO_ENTRY` | `entry_candidate_history` で `NO_ENTRY→WATCH`・`WATCH→ENTRY`・`NO_ENTRY→ENTRY`（=ENTRYへの変化）時 |
| `final_action` | `signal` と `entry_candidate` の両方を入力にした売買判断（`trade_decision.compute_final_action()`、独立した新規フロー） | `BUY` / `WAIT` / `SELL` | `final_action_history.changed_flag=True` かつ `BUY`/`SELL` への変化時のみ |

#### BUY / WAIT / SELL の意味

- **SELL**: `signal` が `STOP_LOSS` / `TAKE_PROFIT` に確定した場合、または `WATCH_STRONG`（急騰急落の強い警戒）かつ損益がプラスの場合
- **BUY**: `entry_candidate=ENTRY` かつ `entry_score >= trade_decision.buy_score_threshold` かつ現在価格がVWAPより上かつ出来高急増が継続中（かつ `signal` が `STOP_LOSS`/`TAKE_PROFIT`/`WATCH_STRONG` のいずれでもない）場合
- **WAIT**: 上記いずれにも該当しない場合（買いでも売りでもない待機状態）

#### BUY / SELL のLINE通知条件

`--notify-line` 指定時、`final_action` が **前回から変化して BUY または SELL になった場合のみ**LINE通知します（`WAIT` への変化や、BUY→BUY・SELL→SELL のような同一継続は通知しません）。

| 変化 | 通知 |
|---|---|
| 初回でBUY / WAIT→BUY | 〇（`trade_decision.notify_final_action_buy: true` の場合） |
| 初回でSELL / WAIT→SELL / BUY→SELL | 〇（`trade_decision.notify_final_action_sell: true` の場合） |
| BUY→WAIT / SELL→WAIT / 同一継続（BUY→BUY 等） | × |

通知文の例：

```
【売買判断】
3237

BUY

現在値：90円
ENTRY_SCORE：88
理由：
ENTRY_SCOREが高く、VWAP上、出来高急増が継続しているためBUY

注意：
これは自動売買ではなく判断支援です。
```

**自動売買は実装していません。** `final_action` はあくまで判定結果の表示・通知のみで、注文の発注などは一切行いません。

### 判定条件の設定（settings.yaml）

デイトレ判定（利確・損切りライン、急騰判定、出来高急増倍率、ENTRY_SCORE閾値・配点、
通知抑制時間など）の判定条件は、コードを直接修正せず `settings.yaml` で変更できます。
プロジェクトフォルダに `settings.yaml` がない場合や項目が不足している場合は、
`config.py` 内のデフォルト値（既存の判定ロジックと同じ値）が使われます。

| セクション.キー | 内容 | デフォルト |
|---|---|---|
| `trade_decision.stop_loss_pct` | 損切りライン（%） | -2 |
| `trade_decision.take_profit_pct` | 利確ライン（%） | 5 |
| `trade_decision.bar_change_strong_pct` | 急騰・急落判定（%） | 4 |
| `trade_decision.abnormal_volume_ratio` | 出来高急増倍率 | 5 |
| `trade_decision.confirm_bars` | STOP_LOSS/TAKE_PROFIT確定に必要な連続本数 | 2 |
| `trade_decision.volume_decline_ratio` | 出来高減少フラグ判定比率 | 0.7 |
| `trade_decision.volume_surge_continuation_ratio` | 出来高急増継続判定比率 | 1.5 |
| `trade_decision.volume_fading_ratio` | 出来高失速判定比率 | 0.7 |
| `trade_decision.vwap_near_pct` | VWAP接近判定 | 0.01 |
| `trade_decision.atr_period` | ATR計算に使う本数 | 14 |
| `trade_decision.atr_stop_multiplier` | ATR損切りラインの算出倍率 | 2 |
| `trade_decision.atr_near_pct` | ATR損切りライン接近判定 | 0.01 |
| `trade_decision.min_bars_for_atr` | ATR計算に必要な最低本数 | 2 |
| `trade_decision.opening_range_start` / `opening_range_end` | 寄り付きレンジの開始/終了時刻 | "09:00" / "09:30" |
| `trade_decision.entry_score_rank_threshold` | 注目銘柄ランキングの「上位」とみなす順位 | 10 |
| `trade_decision.entry_score_threshold` | ENTRY_SCOREがこの値以上で`ENTRY` | 85 |
| `trade_decision.watch_candidate_threshold` | ENTRY_SCOREがこの値以上(ENTRY未満)で`WATCH` | 70 |
| `trade_decision.buy_score_threshold` | `final_action=BUY`判定に必要なENTRY_SCOREの最低値 | 85 |
| `trade_decision.notify_final_action_buy` | `final_action=BUY`（変化時）をLINE通知するか | true |
| `trade_decision.notify_final_action_sell` | `final_action=SELL`（変化時）をLINE通知するか | true |
| `monitoring.time_limit` | この時刻を過ぎたら監視終了 | "15:20" |
| `notification.duplicate_suppress_window_minutes` | 同一銘柄・同一シグナルのLINE通知抑制時間（分） | 30 |

#### ENTRY_SCORE の配点（`trade_decision.entry_score_points`）

| キー | 内容 | デフォルト |
|---|---|---|
| `vwap_above` | 現在価格がVWAPより上 | 20 |
| `prev_high_breakout` | 前日高値ブレイク | 20 |
| `opening_range_breakout` | 寄り付き30分高値ブレイク | 20 |
| `volume_surge_continuation` | 出来高急増継続 | 20 |
| `market_bull` | 地合いが「普通」または「強い」 | 5 |
| `market_bear_penalty` | 地合いが「悪い」場合の減点 | -15 |
| `rank_1_3` | 注目銘柄ランキング1〜3位の加点 | 15 |
| `rank_4_5` | 注目銘柄ランキング4〜5位の加点 | 12 |
| `rank_6_10` | 注目銘柄ランキング6〜10位の加点 | 10 |

`ranking_top`（デフォルト15）も設定項目として存在しますが、現在のロジックでは
`rank_1_3`/`rank_4_5`/`rank_6_10` の段階加点に置き換わっており未使用です。

### 監視終了・手動終了・再監視

銘柄ごとに以下のいずれかに該当すると、その銘柄の監視は自動的に終了し、
`data/stocks.db` の `monitoring_status` テーブルに記録されます。
終了済みの銘柄は、次回以降 `--codes` に指定しても自動的に対象から除外されます。

| 終了理由 | 内容 |
|----------|------|
| `TAKE_PROFIT` | TAKE_PROFIT が確定した |
| `STOP_LOSS`   | STOP_LOSS が確定した |
| `TIME_LIMIT`  | 15:20 を過ぎた |
| `VOLUME_DECLINE` | 出来高が大きく減少した（出来高失速） |
| `MANUAL`      | `--stop-codes` で手動終了した |

#### 手動で監視を終了する

```bash
python main.py --intraday --stop-codes 7203
```

#### 監視終了済みの銘柄を再開する

```bash
python main.py --intraday --resume-codes 7203
```

`--resume-codes` で指定した銘柄は `status` が `RESUMED` になり、
`stop_reason` / `stopped_at` はクリアされ、`resumed_at` に再開日時が記録されます。
監視終了されていない銘柄を指定してもエラーにはならず、ログに表示されるだけです。

```bash
# 7203 を再開し、そのまま 7203 3778 の監視を再開する例
python main.py --intraday --resume-codes 7203
python main.py --intraday --codes 7203 3778 --entry-mode manual
```

`--stop-codes` / `--resume-codes` は管理用の操作のみを行い、その回では
5分足取得・判定は実行されません（指定した場合、他のオプションは無視されます）。

### LINE 通知の設定（LINE Messaging API）

LINE Notify は提供終了のため、[LINE Developers](https://developers.line.biz/) で
Messaging API のチャネルを作成し、チャネルアクセストークンと、通知を受け取る
ユーザーID（自分の LINE ID。チャネルを友だち追加した上で取得）を発行してください。

`.env` に以下を追加します。

```env
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_USER_ID=your_line_user_id
```

トークンまたはユーザーIDが未設定の場合は、通知をスキップしてログのみ出力します
（処理は止まりません）。送信に失敗した場合も同様にログのみで処理は継続します。

通知は `signal_history.changed_flag = True` のイベントのみが対象です
（前回判定からシグナルが変化した場合のみで、同じ内容の連続通知はしません。
`STAY → STAY` や `WATCH → WATCH` のような同一シグナル継続は通知されません）。
通知対象シグナルは `ENTRY` / `WATCH` / `WATCH_STRONG` / `TAKE_PROFIT` / `STOP_LOSS` で、
`STAY` への変化はイベント自体にならないため通知されません。

通知文の例:

```
【デイトレ判定】
7203

STAY → WATCH

現在値：2,580円
買値：2,500円
損益率：+3.2%

理由：
出来高が失速し、VWAPに接近しています。

リスク：MEDIUM
```

**自動売買は行いません。** あくまで判定結果の通知であり、発注操作は行いません。

---

## Windows タスクスケジューラでの自動実行

東証の取引時間（前場 9:00〜11:30 / 後場 12:30〜15:30、昼休みは実行しない）に
5分足デイトレ判定を5分ごとに自動実行する手順です。
繰り返し実行はタスクスケジューラに任せ、Python 側に常駐処理は実装していません
（`run_intraday.bat` は実行されるたびに1回だけ判定して終了します）。
そのため、1回の実行が失敗しても次の5分後のトリガーは独立して実行され、
自動的にリトライされます。

### 1. entry_prices.csv の準備（`--entry-mode manual` を使う場合）

プロジェクトフォルダに `entry_prices.csv` を作成します。

```csv
code,entry_price
7203,2500
3778,4200
```

### 2. run_intraday.bat の確認

`run_intraday.bat` はプロジェクトフォルダにあり、以下を行います。

- プロジェクトフォルダへ `cd`
- `.venv` があれば自動で有効化
- `python main.py --intraday --codes 7203 3778 --entry-mode manual --notify-line` を実行
- 実行開始時刻の見出し付きで、標準出力・エラーを `logs\intraday_bat_YYYYMMDD.log` に
  **追記**保存（日次ファイルなので1日分の実行履歴がすべて残ります）

対象銘柄や `--entry-mode` を変更したい場合は `run_intraday.bat` 内のコマンドを編集してください。

### 3. タスクスケジューラへの登録（前場・後場の2トリガー）

昼休み（11:30〜12:30）は実行しないため、**1つのタスクに前場用・後場用の
2つのトリガーを追加**します。

1. 「タスク スケジューラ」を起動（スタートメニューで検索）
2. 右側の「タスクの作成」をクリック
3. **「一般」タブ**
   - 名前: `stock_ai_intraday`
   - 「ユーザーがログオンしているかどうかにかかわらず実行する」を選択
4. **「トリガー」タブ** → 「新規」を2回（前場・後場それぞれ作成）

   | | 開始時刻 | 繰り返し間隔 | 継続時間 |
   |---|---|---|---|
   | 前場トリガー | 9:00 | 5分 | 2時間30分（11:30まで） |
   | 後場トリガー | 12:30 | 5分 | 3時間（15:30まで） |

5. **「操作」タブ** → 「新規」
   - 操作: 「プログラムの開始」
   - プログラム/スクリプト: `run_intraday.bat` のフルパス
     （例: `C:\claude\stock_ai\run_intraday.bat`）
   - 開始場所（オプション）: プロジェクトフォルダのフルパス
     （例: `C:\claude\stock_ai`）
6. **「設定」タブ**（失敗時も次回実行を妨げないための設定）
   - 「タスクが実行中の場合は、次のルールを適用する」→
     「新しいインスタンスを開始しない」（デフォルトのままでOK）
   - 「タスクが次の時間より長く実行された場合に停止する」にチェックし、
     `3分` 程度を設定（ネットワーク遅延等で処理がハングした場合に、
     次の5分後のトリガーがブロックされないようにするため）
   - 「実行が失敗した場合の再試行」は設定不要（5分後の次のトリガーが
     自動的に新しい実行として走るため）
7. 「OK」で保存

設定後は対象のトリガーを選んで「実行」で手動テストし、
`logs\intraday_bat_YYYYMMDD.log` にログが追記されることを確認してください。

> コマンドラインから登録する場合は、前場・後場をそれぞれ別タスクとして
> `schtasks` で作成することもできます。
>
> ```bat
> schtasks /create /tn "stock_ai_intraday_am" /tr "C:\claude\stock_ai\run_intraday.bat" ^
>   /sc minute /mo 5 /st 09:00 /du 0230 /ru "%USERNAME%"
>
> schtasks /create /tn "stock_ai_intraday_pm" /tr "C:\claude\stock_ai\run_intraday.bat" ^
>   /sc minute /mo 5 /st 12:30 /du 0300 /ru "%USERNAME%"
> ```

### 4. 実行履歴の確認

- `logs\intraday_bat_YYYYMMDD.log`: `run_intraday.bat` が実行ごとに見出し
  （`==== 日付 時刻 ====`）を付けて追記する実行ログ（標準出力・エラー含む）
- `logs\run_YYYY-MM-DD.log`: `main.py` 自身が出力するアプリケーションログ
  （同日内の複数実行分が追記され続けます）
- `data\stocks.db` の `signal_history` テーブル: シグナルの変化イベント履歴
  （`changed_flag`、前回/現在のシグナル、判定時刻が銘柄ごとに残ります）

いずれかのログが想定通り増えていない場合は、タスクスケジューラの
「履歴」タブでタスクの実行結果（最終実行結果コード）を確認してください。

### 5. 日次監視レポートの自動生成（取引終了後）

5分足の監視（`run_intraday.bat`）とは別に、取引終了後にその日の監視結果を
集計した「日次監視レポート」を1日1回自動生成できます。`run_intraday.bat` の
処理内容は変更していません。

`run_daily_report.bat` がプロジェクトフォルダにあり、以下を行います。

- プロジェクトフォルダへ `cd`
- `.venv` があれば自動で有効化
- `python main.py --daily-report` を実行（対象日は実行日。当日の `trade_signals`
  から銘柄ごとに集計）
- 実行開始時刻の見出し付きで、標準出力・エラーを `logs\daily_report_bat_YYYYMMDD.log`
  に追記保存
- Excel は `excel\daily_report_YYYY-MM-DD.xlsx`（「日次監視レポート」シート）に出力

#### タスクスケジューラへの登録（15:35 に1日1回）

1. 「タスク スケジューラ」を起動 → 「タスクの作成」
2. **「一般」タブ**
   - 名前: `stock_ai_daily_report`
   - 「ユーザーがログオンしているかどうかにかかわらず実行する」を選択
3. **「トリガー」タブ** → 「新規」
   - 開始: タスクを開始する日 + `15:35`
   - 「毎日」を選択（繰り返し間隔は設定しない。1日1回のみ）
4. **「操作」タブ** → 「新規」
   - 操作: 「プログラムの開始」
   - プログラム/スクリプト: `run_daily_report.bat` のフルパス
     （例: `C:\claude\stock_ai\run_daily_report.bat`）
   - 開始場所（オプション）: プロジェクトフォルダのフルパス
     （例: `C:\claude\stock_ai`）
5. 「OK」で保存

> コマンドラインから登録する場合:
>
> ```bat
> schtasks /create /tn "stock_ai_daily_report" /tr "C:\claude\stock_ai\run_daily_report.bat" ^
>   /sc daily /st 15:35 /ru "%USERNAME%"
> ```

#### 手動実行

```bash
# 本日分のレポートを作成
python main.py --daily-report

# バッチ経由（タスクスケジューラと同じ実行内容）
run_daily_report.bat

# 対象日を指定する場合
python main.py --daily-report --date 2026-06-17
```

#### ログの確認方法

- `logs\daily_report_bat_YYYYMMDD.log`: `run_daily_report.bat` の実行ログ
  （`==== 日付 時刻 ====` の見出し付きで標準出力・エラーを追記）
- `logs\run_YYYY-MM-DD.log`: `main.py` 自身のアプリケーションログ
- 対象日にデータがない場合はエラーにはならず、警告ログのみで終了します
  （Excelファイルは作成されません）

---

## 処理フロー

```
1. DB 初期化
2. J-Quants: 上場銘柄一覧取得 → DB 保存（403 時は既存 DB を使用）
3. yfinance: 全日本株の直近 N 日分を取得 → daily_quotes に保存
4. yfinance: 日経平均・TOPIX 等の市場指数取得
5. 分析実行（スコアリング）
6. Excel 出力
```

---

## Excel 出力場所

`excel/` ディレクトリに以下の形式で保存されます:

```
excel/stock_analysis_YYYY-MM-DD.xlsx
```

### Excel のシート構成

| シート名 | 内容 |
|----------|------|
| 注目銘柄ランキング | 総合スコア順の注目銘柄一覧 |
| 全銘柄分析結果 | 全銘柄の OHLCV データ |
| テクニカル詳細 | MA・高値更新などのテクニカル指標 |
| 出来高資金流入 | 出来高・売買代金の急増分析 |
| 決算モメンタム | 決算データ（将来対応） |
| ファンダメンタル | 財務データ（将来対応） |
| 市場指数 | 日経平均・NASDAQ・S&P500 等 |
| 実行ログ | 実行日時・件数サマリー |

---

## スコアリング（総合スコア 100 点満点）

### ① テクニカルスコア（最大 25 点）

| 条件 | 加点 |
|------|------|
| 前日比 +3%以上 | +5 |
| 前日比 +5%以上 | +8（+3%と排他） |
| 終値 > MA5 | +5 |
| 終値 > MA25 | +5 |
| 20 日高値更新 | +7 |

### ② 出来高・資金流入スコア（最大 35 点）

| 条件 | 加点 |
|------|------|
| 出来高 5 日平均比 2 倍以上 | +10 |
| 出来高 5 日平均比 3 倍以上 | +15（2 倍と排他） |
| 売買代金 5,000 万円以上 | +5 |
| 売買代金 1 億円以上 | +10（5,000 万と排他） |
| 売買代金 5 日平均比 2 倍以上 | +10 |

### ③ 決算モメンタムスコア（最大 20 点）

> 現在は J-Quants Free プランのため **データなし → 0 点**
> 将来、J-Quants 有料プランや決算 CSV 取込で対応予定

| 条件 | 加点 |
|------|------|
| 売上成長率 +10%以上 | +5 |
| 営業利益成長率 +20%以上 | +5 |
| EPS 成長率 +20%以上 | +5 |
| 進捗率 75%以上 | +3 |
| 上方修正あり | +7 |

### ④ ファンダメンタルスコア（最大 20 点）

> 現在は **データなし → 0 点**
> 将来、J-Quants・Kabutan・IR BANK CSV 取込で対応予定

| 条件 | 加点 |
|------|------|
| PER 0〜15 倍 | +4 |
| PBR 0〜1.5 倍 | +4 |
| ROE 8%以上 | +4 |
| 自己資本比率 40%以上 | +4 |
| 営業利益率 8%以上 | +4 |

---

## 抽出条件（スクリーニング）

| 条件 | 値 |
|------|----|
| 終値 | 50 円以上 3,000 円以下 |
| 前日比 | +3%以上 |
| 出来高（5 日平均比） | 2 倍以上 |
| 売買代金 | 5,000 万円以上 |

---

## プロジェクト構成

```
stock_ai/
├── .env              # 認証情報（要作成）
├── .env.example      # .env のテンプレート
├── requirements.txt
├── README.md
├── run_intraday.bat  # タスクスケジューラ用の実行バッチ（5分足デイトレ判定）
├── run_daily_report.bat # タスクスケジューラ用の実行バッチ（日次監視レポート、1日1回）
├── entry_prices.csv  # --entry-mode manual 用の買値CSV（要作成）
├── config.py         # 設定・定数
├── main.py           # メインエントリーポイント
├── db.py             # DB 操作（SQLite）
├── fetch_jquants.py  # J-Quants API 連携（銘柄マスタ）
├── fetch_yfinance.py # yfinance 連携（日次株価・市場指数）
├── analyze.py        # 分析・スコアリングロジック
├── export_excel.py   # Excel 出力
├── code_parser.py    # --codes の検証・正規化
├── intraday_monitor.py # 5分足取得・損益計算・前日OHLC取得
├── entry_price.py    # エントリー価格決定（first_close / manual）
├── trade_decision.py # デイトレ判定（VWAP・前日高安・寄り付きレンジ・出来高・ATR・スコア）
├── line_notify.py    # LINE Messaging API 送信（push）
├── line_webhook.py   # LINE Webhook サーバー（Flask）- 銘柄コード受信 → watchlist 登録
├── ranking_notifier.py # 注目銘柄ランキングの LINE 通知
├── ranking_validation.py # 過去のランキングが翌営業日に有効だったかの検証
├── watchlist.py      # watchlist（監視対象銘柄）管理
├── notifier.py       # 買い候補（entry_candidate）・売買判断（final_action）の変化検知・通知ロジック
├── monitoring.py     # 銘柄ごとの監視終了条件の判定
├── daily_report.py   # 日次監視レポート集計
├── data/             # SQLite DB
├── excel/            # Excel 出力先
└── logs/             # 実行ログ
```

---

## 将来の拡張予定

### 決算データの追加方法

`earnings_data` テーブル（DB 内）にデータを投入するだけでスコアリングに反映されます。

```python
# 例: CSV から一括取込
import pandas as pd, sqlite3
df = pd.read_csv("earnings.csv")
df.to_sql("earnings_data", sqlite3.connect("data/stocks.db"),
          if_exists="append", index=False)
```

### ファンダメンタルデータの追加方法

`fundamentals` テーブルに投入するだけで反映されます。

```python
df = pd.read_csv("fundamentals.csv")
df.to_sql("fundamentals", sqlite3.connect("data/stocks.db"),
          if_exists="replace", index=False)
```

### LINE 通知

実装済みです。「5分足デイトレ判定（イントラデイ監視）」セクションを参照してください。

---

## トラブルシューティング

### yfinance レート制限エラー（Too Many Requests）

yfinance の無料 API にはレート制限があります。バッチ間に遅延を入れていますが、それでも失敗する場合は少し時間をおいてから再実行してください。

### 「分析対象データが見つかりません」

`--skip-fetch` でデータなしに分析のみを実行しようとした場合に発生します。まず通常実行でデータを取得してください。

### Excel が開けない

`excel/` フォルダを削除して再実行してください。
