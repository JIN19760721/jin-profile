# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a monorepo containing several independent projects. Each active project keeps its own `CLAUDE.md` with project-specific commands and architecture — read that file when working inside its directory. This root file only covers monorepo-wide notes.

```
C:\claude\
├── auto-trade_ai/         # 日本株デイトレード自動売買システム（本番運用中・メインプロジェクト）
│                           # 詳細は auto-trade_ai/CLAUDE.md を参照
├── english-learning-app/  # 英語学習アプリ。詳細は english-learning-app/CLAUDE.md（@AGENTS.md）を参照
├── word-chain/            # 小規模な単体HTML（index.htmlのみ）。しりとりアプリ等の実験用
├── studyeng_ai/           # 空ディレクトリ（未使用。内容なし）
├── jquants_fetch.py       # スタンドアロンの J-Quants 日次株価取得スクリプト
└── index.html
```

### stock_ai は廃止済み

旧メインプロジェクトだった `stock_ai/`（日本株注目銘柄の自動抽出・イントラデイ監視ツール）はディスク上から削除されています。同じ用途のロジックは `auto-trade_ai/` に引き継がれ、そちらが本番で稼働中です。`stock_ai/`固有のアーキテクチャ説明（analyze.py、trade_decision.py等）が必要な場合はgit履歴（`git log -- stock_ai/`）を参照してください。

### 各プロジェクトの詳細

- **auto-trade_ai** — 開発コマンド・アーキテクチャ・DBスキーマ・Phaseロードマップ等は `auto-trade_ai/CLAUDE.md` を参照。V2設計書全文は `auto-trade_ai/docs/v2_design_phase0.md`。
- **english-learning-app** — `english-learning-app/CLAUDE.md`（`@AGENTS.md`を読み込む形式）を参照。
- **word-chain / studyeng_ai** — 現状ドキュメント化するほどの実体がない小規模/空ディレクトリ。作業対象になった場合は都度確認すること。
