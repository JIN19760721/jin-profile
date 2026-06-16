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

## 5分足デイトレ判定（イントラデイ監視）

指定銘柄（最大5件）の5分足を取得し、エントリー価格に対する損益率や VWAP・前日高安・
寄り付き30分レンジ・出来高・ATR などを用いたデイトレ判定（STAY/WATCH/WATCH_STRONG/
TAKE_PROFIT/STOP_LOSS/ENTRY）を行います。注目銘柄ランキング機能とは独立した、別コマンドの実行系です。

```bash
# エントリー価格を当日最初の5分足終値とする場合
python main.py --intraday --codes 7203 3778 --entry-mode first_close

# entry_prices.csv（code,entry_price）から買値を読み込む場合
python main.py --intraday --codes 7203 3778 --entry-mode manual

# シグナル変化時にLINE Notifyへ通知する場合（--notify-line を付与）
python main.py --intraday --codes 7203 3778 --entry-mode manual --notify-line
```

- `--codes`: 対象銘柄コード（4桁数字、最大5件、超過分は切り捨て）
- `--entry-mode`: `first_close`（デフォルト）または `manual`
- `--notify-line`: 付与した場合のみ LINE へ通知する（未指定時はログ出力のみ）
- 結果は `data/stocks.db` の `intraday_prices` / `intraday_positions` / `trade_signals` /
  `signal_history` テーブルと、`excel/intraday_prices_YYYY-MM-DD_HHMM.xlsx`
  （5分足データ・損益計算・デイトレ判定・シグナル変化履歴の各シート）に出力されます

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
├── line_notify.py    # LINE Messaging API 送信
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
