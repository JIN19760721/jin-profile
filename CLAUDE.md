# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a monorepo containing several independent projects. Each active project keeps its own `CLAUDE.md` with project-specific commands and architecture — read that file when working inside its directory. This root file only covers monorepo-wide notes.

```
C:\claude\
├── auto-trade_ai/         # 別リポジトリ（非公開）。このリポジトリでは.gitignoreで除外している
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

- **auto-trade_ai** — 2026-10-19に独立した非公開リポジトリ `JIN19760721/auto-trade-ai` へ移行した（`C:\claude\auto-trade_ai` がそのクローン）。このリポジトリ（jin-profile、公開）からは履歴ごと削除済みのため、**auto-trade_ai配下の変更はこのリポジトリにコミット・pushしないこと**。git操作は `auto-trade_ai/` 内で行う。開発コマンド等は `auto-trade_ai/CLAUDE.md` を参照。
- **english-learning-app** — `english-learning-app/CLAUDE.md`（`@AGENTS.md`を読み込む形式）を参照。
- **word-chain / studyeng_ai** — 現状ドキュメント化するほどの実体がない小規模/空ディレクトリ。作業対象になった場合は都度確認すること。
