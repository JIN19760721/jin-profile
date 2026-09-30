# auto-trade_ai — kabuステーション デイトレ候補銘柄抽出ツール

kabuステーション API のランキング機能を使い、デイトレード用の候補銘柄を抽出して CSV に出力するツールです。

> **注意:** このツールは投資判断を自動化するものではありません。あくまでランキングデータを統合・スコアリングして候補を絞り込む補助ツールです。売買発注機能は含まれていません。実際の投資判断はご自身の責任でお願いします。

---

## 前提条件

### kabuステーション側の設定

1. **Professionalプラン以上**が必要です（ランキングAPIはProfessional以上で利用可能）
2. kabuステーション（デスクトップアプリ）を起動してください
3. kabuステーション内で **「APIパスワード」を設定** し、**「API利用設定」をON** にしてください
   - 設定場所: kabuステーション → 設定 → API → API利用設定

### 動作環境

- Python 3.11 以上
- Windows 環境（kabuステーションが同一PCで起動していること）

---

## セットアップ

```bash
cd auto-trade_ai

python -m venv .venv
.venv\Scripts\activate

pip install -r requirements.txt

copy .env.example .env
# .env を編集して API_PASSWORD を設定する
```

### .env の設定

```env
# kabuステーション APIパスワード（kabuステーション側で設定したパスワード）
API_PASSWORD=your_api_password_here

# 接続先環境: prod（本番 18080）または test（検証 18081）
KABU_ENV=test

# デフォルトの市場フィルタ: ALL / T / TP / TS / TG
EXCHANGE_DIVISION=TP

# 最低出来高フィルター（この値未満の銘柄をスコアリング対象から除外する）
MIN_TRADING_VOLUME=10000
```

| キー | 説明 | デフォルト |
|---|---|---|
| `API_PASSWORD` | kabuステーション側で設定したAPIパスワード | （必須） |
| `KABU_ENV` | `prod`=本番(18080) / `test`=検証(18081) | `test` |
| `EXCHANGE_DIVISION` | デフォルトの市場フィルタ | `TP` |
| `MIN_TRADING_VOLUME` | 最低出来高（この値未満は除外） | `10000` |

---

## 実行方法

```bash
# 東証プライム、上位30件（デフォルト）
python -m src.main

# 東証プライム、上位30件（明示指定）
python -m src.main --exchange TP --top 30

# 東証スタンダード、上位30件
python -m src.main --exchange TS --top 30

# グロース250、上位20件
python -m src.main --exchange TG --top 20

# 東証全体
python -m src.main --exchange T --top 50

# 全市場
python -m src.main --exchange ALL --top 50
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--exchange` | 市場フィルタ（ALL/T/TP/TS/TG） | `.env` の `EXCHANGE_DIVISION` |
| `--top` | コンソール表示の上位N件（CSVは全件出力） | 30 |

---

## 出力

### コンソール

```
====================================================================================================
  デイトレ候補銘柄 上位 30 件  [ExchangeDivision=TP]
====================================================================================================
  #  Symbol  銘柄名                 現在値     前日比   score  理由
----------------------------------------------------------------------------------------------------
  1  9434    ソフトバンク            1500.0   +8.50%   85.5  値上がり率(1位) / 売買代金急増(2位) / 売買高急増(3位)
  2  3778    さくらインターネット     4200.0   +6.30%   79.0  値上がり率(3位) / 売買代金急増(5位)
...
```

### CSV（`output/realtime_candidates.csv`）

全候補銘柄をスコア降順で出力します（Excel で直接開けるよう BOM 付き UTF-8）。

| 列名 | 内容 |
|---|---|
| Symbol | 銘柄コード |
| SymbolName | 銘柄名 |
| ExchangeName | 市場名 |
| CategoryName | 業種名 |
| CurrentPrice | 現在値 |
| ChangePercentage | 前日比（%） |
| TradingVolume | 出来高 |
| Turnover | 売買代金 |
| RapidTradePercentage | 出来高急増率 |
| RapidPaymentPercentage | 売買代金急増率 |
| TickCount | TICK回数 |
| score | 総合スコア |
| reasons | スコア根拠（どのランキングに何位で入っていたか） |
| fetched_at | データ取得日時 |

---

## 取得項目と代替項目

kabuステーションの「リアルタイム株価予測」画面で表示される一部の項目はAPIで直接取得できないため、以下の代替を使用しています。

| リアルタイム株価予測の表示 | 代替API項目 | ランキング種別 |
|---|---|---|
| 予想値上がり率 | `ChangePercentage`（前日比%） | Type=1 値上がり率ランキング |
| 予想売買代金急増 | `RapidPaymentPercentage`（売買代金急増率） | Type=7 売買代金急増ランキング |
| 出来高急増 | `RapidTradePercentage`（出来高急増率） | Type=6 売買高急増ランキング |
| 予想価格上下回数 | `TickCount`（TICK回数） | Type=5 TICK回数ランキング |
| 市場フィルタ | `ExchangeDivision` | CLI の `--exchange` オプション |

---

## スコアリング

4つのランキングへの出現状況と順位を統合してスコアを計算します。

| ランキング | 基礎点 | ランキング種別 |
|---|---|---|
| 値上がり率 | +25点 | Type=1 |
| 売買代金急増 | +30点 | Type=7 |
| 売買高急増 | +25点 | Type=6 |
| TICK回数 | +10点 | Type=5 |

- 各ランキングの **順位が下がるほど最大5点減点**（1位=0点減、100位=5点減）
- 複数のランキングに出現した銘柄ほど高スコアになります
- `MIN_TRADING_VOLUME` 未満の銘柄はスコアリング前に除外されます

---

## 注意事項

### ランキングAPIが空になる時間帯

**平日の 7:53〜9:10 頃** は前場の準備中のため、ランキングAPIが空のレスポンスを返す場合があります。
この時間帯にツールを実行すると「ランキングが空でした」というログが出ますが、エラーではありません。

取引時間内（前場 9:00〜11:30、後場 12:30〜15:30）に実行することを推奨します。

### API接続エラーが出る場合

- kabuステーション（デスクトップアプリ）が起動しているか確認してください
- kabuステーションの「API利用設定」がONになっているか確認してください
- `.env` の `KABU_ENV` と実際の接続ポートが一致しているか確認してください
  - `KABU_ENV=prod` → ポート 18080
  - `KABU_ENV=test` → ポート 18081

---

## プロジェクト構成

```
auto-trade_ai/
├── src/
│   ├── config.py           # 設定・定数（.env 読み込み）
│   ├── kabu_client.py      # kabuステーション REST API クライアント
│   ├── ranking_fetcher.py  # ランキングAPI取得
│   ├── screener.py         # スコアリング・銘柄統合
│   ├── exporter.py         # CSV出力
│   └── main.py             # CLIエントリーポイント
├── output/                 # CSV出力先
├── requirements.txt
├── .env.example
└── README.md
```
