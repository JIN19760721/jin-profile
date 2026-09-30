Run the ranking algorithm effectiveness validation script for the auto-trade_ai project.

Execute the following command from the `C:\claude\auto-trade_ai` directory:

```
python scripts/validate_ranking.py $ARGUMENTS
```

After running, analyze and summarize the output in Japanese with these points:
1. ベンチマーク（日経225 ETF）との比較
2. 高スコア（>=60）グループの勝率・平均騰落率
3. ランキング出現数別（3種/2種/1種）の比較
4. スコア vs 騰落率の相関係数の解釈
5. アルゴリズムの有効性に関する総合評価と改善提案（あれば）

Usage examples:
- `/validate-ranking` — 最新の daily_candidates を使って検証
- `/validate-ranking --date 2026-07-03` — 特定日を指定して検証
