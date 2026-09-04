# 日本株 注目銘柄 自動抽出ツール

J-Quants（銘柄マスタ）と yfinance（日次株価）を組み合わせ、日本株の全銘柄データを取得・分析して注目銘柄を Excel に出力するツールです。

## 必要な API キー

### J-Quants（銘柄マスタ取得に使用）

- [J-Quants](https://jpx-jquants.com/) でアカウント登録（無料プランで利用可能）
- ダッシュボードで API キーを発行し `.env` に設定

### yfinance（日次株価取得に使用）

- yfinance は API キー不要で利用できます

### EDINET（決算モメンタムスコア算出に使用、任意・無料）

決算モメンタムスコア（決算発表30日以内・業績予想の上方修正・営業利益YoY+50%以上・増配を
EDINETの開示書類から判定し、最大90点を注目銘柄ランキングに加点する機能）に使用します。

- [EDINET](https://disclosure2.edinet-fsa.go.jp/) にアクセスし、APIキーを発行する
  （画面右上のメニューから「APIキー利用かんたんガイド」を参照、無料）
- 発行したキーを `.env` の `EDINET_API_KEY` に設定する
- **未設定でもツールは正常に動作します**。決算モメンタムスコアは常に0点として
  処理が継続され、テクニカル・出来高・ファンダメンタル（PER/PBR等）スコアのみで
  ランキングされます

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

# 任意（決算モメンタムスコア算出用、未設定でも動作する）
EDINET_API_KEY=your_edinet_api_key_here
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

- 取引状態インジケーター: 画面上部に現在の状態（本日は取引日ではない/監視待機中/取引時間内/取引時間終了）を常に表示します（`config.get_market_status()`）。「監視待機中」「取引時間内」の表示は、`line_webhook.py`（内蔵スケジューラ）が起動中であることを前提とした案内です
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
- エントリー価格は、`intraday_prices` に翌営業日の5分足データがあれば「最初の5分足終値」
  （`entry_mode="first_close"` と同じ定義）を使い、無ければ日次始値で代替します
  （5分足データは watchlist/`--intraday` 対象銘柄＝最大5件のみのため、大多数は日次始値ベースです）
- 既存の注目銘柄ランキング抽出・通知機能（`analyze.py` / `ranking_notifier.py`）は変更しません
- 自動売買は行いません。出力先は `excel/ranking_validation_{対象日}.xlsx`（シート名: 「ランキング検証」）です

GUI（Streamlitの「ランキング検証」タブ）からも同じ検証を実行できます。

### 複数日まとめ検証・スコア要素の有効性分析

保存済みの全日付分のランキングをまとめて検証し、各スコア要素（テクニカル・出来高・
決算モメンタム・ファンダメンタル・過熱ペナルティ・地合いスコア）と翌日リターンの
相関係数、スコア帯別の的中率を集計できます。的中率が低い場合に「どのスコア要素が
実際に効いているか」を確認し、スコア配分を見直すために使います。

```bash
python main.py --validate-ranking-all
python main.py --validate-ranking-all --start-date 2026-06-01 --end-date 2026-06-30
```

出力先は `excel/ranking_validation_all.xlsx`（シート: 「スコア要素の有効性」「複数日ランキング検証」）です。
GUIの「ランキング検証」タブ下部「全期間まとめて検証」ボタンからも実行できます。

**注意:** 過熱・連続上昇ペナルティ・地合いスコアは2026年6月22日のデータで判明した
「当日急騰ほど翌日下落しやすい」という1日分の傾向を基に追加した調整項目です。
6日分（約180件）で再検証した結果、決算モメンタムスコア・地合いスコアの相関は
むしろ弱い／逆方向に出るケースもあり、**現時点ではどのスコア要素も翌日リターンを
安定して予測できるとは言えません**。日数を増やして`--validate-ranking-all`で
継続的に検証し、相関が確認できた要素から重み付けを調整することを推奨します。

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

- 4桁の英数字コードを抽出（重複除外）
- 1回のメッセージで指定できるのは最大5銘柄。超過時はエラー返信
- 本日の注目銘柄ランキングに含まれる銘柄のみ登録可能（ランキング外は登録せず返信）

#### watchlist の構成（最大6件）

`python main.py` 実行時に、watchlist は次の最大6件で**全面的に**再登録されます（既存分は
全て無効化されてから登録し直される）。

- **スコア順位スロット（最大5件、`slot_rank=1〜5`、`source="RANKING"`）**:
  注目銘柄ランキングのスコア上位5銘柄
- **ストップ高翌日継続候補スロット（最大1件、`source="STOP_HIGH"`）**:
  本日ストップ高だった銘柄のうち翌日も継続しやすいと判断した1銘柄（無ければ登録なし）

#### LINEでの上書き（スコア順位スロットのみが対象）

LINEで銘柄を指定すると、**watchlist全体を無効化するのではなく**、スコア順位スロットの
うち優先度が低い（`slot_rank`が大きい、またはまだ埋まっていない）スロットから順に
指定銘柄で上書きします。上書きされた銘柄はそのスロット番号を引き継ぐため、次にLINEで
指示するときも同じ基準（スコア下位＝スロット番号が大きい方）で再度上書きされます。
**ストップ高翌日継続候補スロットはLINEの上書き対象外で、常にそのまま維持されます。**

例: スコア順位スロットが `[1位 A, 2位 B, 3位 C, 4位 D, 5位 E]` の状態でLINEから
2銘柄（F, G）を指定すると、優先度が最も低い4位・5位（D, E）が F, G に置き換わり、
`[1位 A, 2位 B, 3位 C, 4位 F, 5位 G]` になります。さらに別のLINE指示で1銘柄（H）を
送ると、今度は最も優先度の低い5位（G）が H に置き換わります。
- **取引日でない場合（土日・日本の祝日、`config.is_trading_day()`）は watchlist 登録・
  監視起動を一切行わず、「本日は取引日ではありません。」と返信するだけで処理を終了します**
- **取引時間内（平日・祝日を除く09:00〜15:30、`config.is_market_open_now()`）に登録した場合は、
  登録した銘柄の5分足監視（`main.py --intraday --notify-line`）をバックグラウンドで
  即時起動します。**Webhookの応答（LINEへの返信）はこの監視処理の完了を待たないため、
  Webhook自体は数秒以内に応答します。判定結果は`--notify-line`により別途LINE通知されます。
  ログは `logs/webhook_intraday_YYYYMMDD.log` に出力されます
- 取引日だが取引時間外（09:00より前など）に登録した場合は即時起動せず「監視待機中」と
  返信します。実際の監視開始は、**Windowsタスクスケジューラを使わず**`line_webhook.py`
  プロセス自身が内蔵する定期実行スレッドが担います。取引時間中は5分おき・取引時間外は
  1分おきに状態を再チェックするため、09:00を過ぎると遅延なく自動的に監視が始まります
  （`line_webhook.py` が起動中である必要があります。`run_gui.bat` 経由なら自動起動されます）
- 前回起動した監視がまだ実行中の場合、定期実行・Webhook起動のどちらも今回の起動を
  スキップします（重複実行防止）

### LINE 返信例

**正常時（取引時間内）:**
```
監視対象を更新しました（スコア下位の銘柄から上書き）。
7203 トヨタ自動車
3778 さくらインターネット

取引時間中のため、5分足監視をバックグラウンドで開始しました。
```

**正常時（取引日だが取引時間外）:**
```
監視対象を更新しました（スコア下位の銘柄から上書き）。
7203 トヨタ自動車
3778 さくらインターネット

取引時間外のため監視待機中です。取引時間（09:00〜15:30）になると自動的に監視を開始します。
```

**取引日でない場合:**
```
本日は取引日ではありません。
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

### 現在の監視銘柄を確認する（LINE）

LINEに以下を送信すると、現在アクティブな監視銘柄一覧（スコア順位スロット最大5件＋
ストップ高翌日継続候補）を返信します。

```
監視リスト
watchlist
```

**返信例:**
```
【現在の監視銘柄】
1. 7203 トヨタ自動車（ランキング）
2. 3778 さくらインターネット（LINE指定）
3. 9984 ソフトバンクグループ（ランキング）
4. 6758 ソニーグループ（ランキング）
5. 8035 東京エレクトロン（ランキング）

ストップ高翌日継続候補: 2961 シーズ・ホールディングス
```

### 監視終了済み銘柄の再開（LINE）

STOP_LOSS / TAKE_PROFIT 確定や15:20の監視終了時刻超過などで監視が終了した銘柄は、
**翌営業日になると自動的に監視対象に戻ります**（手動操作は不要）。日付をまたがず
**同日中にすぐ再監視したい場合**は、LINE で以下のように送信してください。

```
再開 6125
resume 6125 3778
```

- 本日 STOPPED になった銘柄のみ再開対象（すでに翌営業日扱いで対象外の銘柄は
  「本日監視終了されていないため再開対象外です」と返信されます）
- 取引時間内に送信した場合は、登録済みの「監視」コマンドと同様に
  5分足監視をバックグラウンドで即時起動します
- 取引日でない場合は登録せず「本日は取引日ではありません。」と返信します

CLI から再開する場合は `python main.py --resume-codes 6125 --intraday` でも同じ操作が可能です。

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

### 利益確定のトレーリングストップ

利確ライン（`take_profit_pct`、デフォルト+5%）に到達しても、**その場で即座にTAKE_PROFITを
確定しません**。さらに伸びる可能性があるため、到達後は当日のピーク損益率（5分足終値ベース）を
追跡する「トレーリング監視」に切り替わります。

- ピークからの戻りが `take_profit_trail_pct`（デフォルト2pt）未満: `signal=WATCH`
  として保留し、伸びを待つ（reasonに「利益確定ライン到達（ピーク+X%、現在+Y%）。
  伸び期待のため利益確定を保留中」と表示）
- ピークからの戻りが `take_profit_trail_pct` 以上: その時点で**即時** `TAKE_PROFIT` を
  確定する（戻り自体が確認材料のため、通常の2本連続確認は不要）

なお、VWAP割れ・前日安値割れ・寄り付き30分安値割れ・ATR損切りラインのいずれかに
該当した場合は、損益がプラスでもこのトレーリング監視より優先して `STOP_LOSS` 側で
判定されます（利確ライン到達後でも、それらのリスク管理ルールは変わりません）。

`take_profit_trail_pct` は `settings.yaml` で変更できます。

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
| `trade_decision.take_profit_pct` | 利確ライン（%）。到達後はトレーリング監視に切り替わる | 5 |
| `trade_decision.take_profit_trail_pct` | 利確ライン到達後、ピークからこのpt以上戻したらTAKE_PROFIT確定 | 2 |
| `trade_decision.bar_change_strong_pct` | 急騰・急落判定（%） | 4 |
| `trade_decision.abnormal_volume_ratio` | 出来高急増倍率 | 5 |
| `trade_decision.confirm_bars` | STOP_LOSS確定に必要な連続本数（TAKE_PROFITはトレーリング監視のため対象外） | 2 |
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

> **タスクスケジューラを使いたくない場合:** `python line_webhook.py`
> （または `run_gui.bat`）を起動しておけば、そのプロセス自身が内蔵スケジューラ
> スレッドとして取引時間中に watchlist 銘柄の5分足監視を自動実行します
> （「LINE で銘柄を登録して監視する」セクション参照）。タスクスケジューラは、
> 固定の `--codes` を指定した監視やPC起動時の確実な自動実行など、
> プロセスの常時起動に依存したくない場合の選択肢として使えます。

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
| 決算モメンタム | 決算データ（CSV手動投入時のみ、将来対応） |
| ファンダメンタル | PER/PBR/ROE等の財務データ（EDINETから自動算出、または手動CSV投入） |
| 市場指数 | 日経平均・NASDAQ・S&P500 等 |
| 実行ログ | 実行日時・件数サマリー |

---

## スコアリング

`total_score` は次のように、**検証済みのベースライン**と**重み付きの未検証要素**に
分けて構成される（`analyze.py`）。

```
baseline_score = テクニカル(最大25点) + 出来高・資金流入(最大35点)        ← 最大60点、重み固定1
total_score    = baseline_score
               + ファンダメンタル(最大20点)                              ← 重み固定1
               + SCORE_WEIGHT_EARNINGS_MOMENTUM × 決算モメンタム(最大90点) ← デフォルト重み0
               + SCORE_WEIGHT_RISK_PENALTY      × 過熱・連続上昇ペナルティ ← デフォルト重み0
               + SCORE_WEIGHT_MARKET_SENTIMENT  × 地合いスコア            ← デフォルト重み0
```

`baseline_score` は `analysis_results` に専用列として保存され、ランキング・GUI・
Excelのどこからでも `total_score` と比較できる。

### スコア要素の採用ルール

決算モメンタム・過熱ペナルティ・地合いスコアは、いずれも限られた日数のデータから
仮説を立てて実装したが、`--validate-ranking-all` による複数日検証（2026年6月時点で
6日・約185件）では翌日リターンとの安定した正の相関が確認できなかった
（むしろ負の相関が出た要素もある）。そのため `config.py` の
`SCORE_WEIGHT_EARNINGS_MOMENTUM` / `SCORE_WEIGHT_RISK_PENALTY` /
`SCORE_WEIGHT_MARKET_SENTIMENT` を **デフォルト0** にし、ランキング順位への影響を
止めている。各スコア自体は分析結果に保存され続けるため、重みを0にしてもデータ収集は
継続される。

**重みを1に戻す（再度ランキングに反映する）条件:**
1. `python main.py --validate-ranking-all` を最低15〜20営業日分のデータが蓄積するまで
   定期的に実行する
2. `correlation_summary()`（GUIの「全期間まとめて検証」または `スコア要素の有効性`
   Excelシート）で、対象要素が翌日リターン（`close_return_pct`）と安定して
   正の相関を示すことを確認する
3. 確認できた要素のみ、対応する `SCORE_WEIGHT_*` を `config.py` で `1.0` に戻す
   （他の未確認要素は0のままにする）

この手順を踏まずに重みを戻すと、1日分のデータで見つけたパターンに過剰適合した
過去の失敗（過熱ペナルティ・地合いスコアの導入時）を繰り返すことになるため、
必ず複数日分の検証を経ること。

### ① テクニカルスコア（最大 25 点、baseline_score の一部）

| 条件 | 加点 |
|------|------|
| 前日比 +3%以上 | +5 |
| 前日比 +5%以上 | +8（+3%と排他） |
| 終値 > MA5 | +5 |
| 終値 > MA25 | +5 |
| 20 日高値更新 | +7 |

### ② 出来高・資金流入スコア（最大 35 点、baseline_score の一部）

| 条件 | 加点 |
|------|------|
| 出来高 5 日平均比 2 倍以上 | +10 |
| 出来高 5 日平均比 3 倍以上 | +15（2 倍と排他） |
| 売買代金 5,000 万円以上 | +5 |
| 売買代金 1 億円以上 | +10（5,000 万と排他） |
| 売買代金 5 日平均比 2 倍以上 | +10 |

### ③ 決算モメンタムスコア（最大 90 点、EDINET API、デフォルト重み0）

`fundamental_score.py` が EDINET の開示書類（有価証券報告書・四半期報告書・
半期報告書・臨時報告書）から算出する。`EDINET_API_KEY` が未設定、または
取得・解析に失敗した場合は **常に 0 点** として処理を継続する（システムは停止しない）。

| 条件 | 加点 |
|------|------|
| 決算発表から30日以内 | +20 |
| 業績予想の上方修正（臨時報告書から検出） | +30 |
| 営業利益 YoY +50%以上 | +30 |
| 増配（記念配当・特別配当のみは除外） | +10 |

注目銘柄ランキングのExcelシートには、上記の判定結果が
`earnings_within_30d` / `upward_revision` / `op_profit_growth_50` / `dividend_increase`
の真偽値としても出力される。

決算モメンタムの有無で売買成績を比較したい場合は、以下のコマンドで
バックテストを2グループに分けて実行できる。

```bash
python main.py --backtest --compare-fundamental
```

### ④ ファンダメンタルスコア（最大 20 点）

`fundamentals` テーブルに手動投入済みのデータ（後述）があればそれを優先し、無ければ
`fundamentals_fetcher.py` が EDINET の直近決算書類（有報/四半期/半期報告書の
「業績等の概要」）から PER・PBR・ROE・自己資本比率・営業利益率を自動算出して
`fundamentals` テーブルに保存する（次回以降はキャッシュとして再利用される）。
EDINETでも算出できない場合は **0点**として処理を継続する。

| 条件 | 加点 |
|------|------|
| PER 0〜15 倍 | +4 |
| PBR 0〜1.5 倍 | +4 |
| ROE 8%以上 | +4 |
| 自己資本比率 40%以上 | +4 |
| 営業利益率 8%以上 | +4 |

**注意:**
- 「業績等の概要」に営業利益（OperatingIncome）が含まれない企業（IFRS適用企業や
  証券・金融業など）も多く、その場合 `operating_margin` は算出できず0点扱いになる
- PER・ROE・自己資本比率は企業が開示した値をそのまま使用するため、まれに連結・個別
  の区分や開示単位の違いにより異常値が混在することがある。自己資本比率・ROEについては
  妥当な範囲（自己資本比率: -20%〜100%、ROE: -300%〜300%）を外れる値は棄却し、
  他の候補タグにフォールバックする

### ⑤ 過熱・連続上昇ペナルティ（最大 -23 点、デフォルト重み0）

ランキング検証で「当日の前日比が大きい銘柄ほど翌日は下落しやすい」傾向が
確認されたため、過熱した銘柄ほど減点する調整項目として追加（`config.py`で調整可能）。
抽出条件の上限（後述の `MAX_PRICE_CHANGE_PCT`）導入後も母集団内で差が出るよう、
閾値はその範囲内に設定している。

| 条件 | 加点 |
|------|------|
| 前日比 +8.5%以上 | -15 |
| 前日比 +6.0%以上8.5%未満 | -7 |
| 連続上昇日数 4日以上 | -8 |

### ⑥ 地合いスコア（±10 点、デフォルト重み0）

`market_indices`（日経平均・TOPIX連動ETF・NASDAQ・S&P500）の対象日の前日比平均から
地合いを判定し、ランキングに反映する。

| 地合い | 加減点 |
|------|------|
| 強い（平均+1.0%以上） | +5 |
| 普通 | 0 |
| 悪い（平均-1.0%以下） | -10 |

③⑤⑥はいずれも2026年6月22日の1日分のデータを基に追加したが、複数日（6日・約185件）で
再検証した結果、効果は確認できていない（上記「スコア要素の採用ルール」参照）。
そのため現在は `SCORE_WEIGHT_*` が0になっており、`total_score` には反映されない
（baseline_score とファンダメンタルスコアのみが実質的にランキング順位を決める）。

---

## 抽出条件（スクリーニング）

| 条件 | 値 |
|------|----|
| 終値 | 10 円以上 200,000 円以下 |
| 前日比 | +3%以上 10%以下 |
| 出来高（5 日平均比） | 2 倍以上 |
| 売買代金 | 5,000 万円以上 |

前日比の上限（`MAX_PRICE_CHANGE_PCT`）は、既に大きく跳ねた「過熱した」銘柄を
母集団から除外するために設けている。当初は上限なし（下限+3%のみ）だったが、
抽出された候補の前日比平均が+12〜13%に達し、翌日の的中率が低い一因と判断したため、
スコアでの減点（⑤過熱ペナルティ）だけでなく、抽出条件自体で除外するようにした。

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

`EDINET_API_KEY` を設定していれば、分析実行時（フィルター後の候補銘柄のみ）に
`fundamentals_fetcher.py` が自動で算出・保存するため、通常は手動投入は不要です。

Kabutan・IR BANK 等から取得したCSVを使いたい場合や、EDINETで算出できない項目を
補いたい場合は、`fundamentals` テーブルに直接投入することも可能です（手動投入分が
EDINETによる自動算出より優先されます）。

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
