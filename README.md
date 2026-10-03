# ライフプラン 簡易シミュレーション

公開 URL: **https://yorozu-craft.com/lifeplan/**

年齢・年収・家族・住まいの 4 項目で、貯蓄残高が 100 歳までどう動くかを年ごとに試算する（yorozu-plans ROADMAP 7.22・企画書 73）。
yorozu-craft のツールの1つです（共通ルールは [youheioonuki.github.io の README](https://github.com/YouheiOonuki/youheioonuki.github.io) を参照）。

## 機能

- 必須は 4 項目（年齢・年収・家族・住まい）。退職・年金・子の進路・生活費・特別費などは「くわしい設定」
- 結果: 残高の折れ線（0 を切った年は赤）、3 つの数字（0 を切る年齢・60 歳時点の残高・教育費の合計）、年ごとの表、3 つの前提（入力どおり／支出 +10%／利回り 0%）
- CSV の書き出し、印刷（A4 2 枚）、共有リンク（`#s=`）、JSON の書き出し・読み込み、保存した内容をすべて消す
- 入力内容はこの端末のブラウザにだけ保存し、外部には送信しない
- 書かないこと: 金融商品・保険の名前、「おすすめ」の利回り、結論の数字、「不足しています」の断定（tests/calc.test.js で検査）

## 計算の仕様・根拠

- 年末の残高 ＝ 年初の残高 ×（1 ＋ 利回り）＋ 手取りの収入 − 支出（利回りは残高がプラスのときだけ）。本人が「何歳まで見るか」（既定 100 歳）の年まで
- 手取り・税・社会保険料・繰上げ繰下げの率は **seido-keisan の `lib/*.js` をそのまま読む**（画面は `../seido-keisan/lib/` を `<script>`、テストは `SEIDO_KEISAN_DIR`。CI は seido-keisan を取ってくる）。値を写さない
- 生活費・教育費・医療費・年金の既定値は `constants.js`（各値に `source`・`url`・`checked`）。`guide.html` の出典の表（`<table id="sources">`）と一致することをテストで確かめる
- 統計ではない仮定（退職 65 歳・厚生年金 22 歳から・利回り 0%・物価 0% など）は `constants.js` の `ASSUME`

## 保守

| 時期 | 確認すること | 直す場所 |
|------|------------|---------|
| 毎年4月 | 老齢基礎年金の満額（日本年金機構「老齢年金ガイド」） | `constants.js` の `kisoMangaku`、`guide.html` |
| 毎年2月 | 家計調査の年次（前年の平均） | `living2p`・`living1p` |
| 毎年10月ごろ | 国民医療費の概況（2 年前の年度） | `iryohi` |
| 隔年12月ごろ | 子供の学習費調査・私立大学の学生納付金等調査 | `gakushuhi`・`univPrivate` |
| 随時 | 国立大学の標準額の省令、日本政策金融公庫の教育費の調査、公的年金等控除 | `univNational`・`shiokuri`・`nenkinKojo65` |
| seido-keisan の改定のとき | 手取りの計算（`lib/take-home.js`）の入出力が変わっていないか | `calc.js` の `takeHomeRate`・`pensionNet` |

値や計算を直したら、`guide.html` の「更新履歴」に日付と内容を 1 行足す。

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` | ツール本体 |
| `guide.html` | 使い方・根拠と確認日・よくある質問・ご利用上の注意・更新履歴 |
| `calc.js` | 計算ロジック（画面から切り離した純粋関数） |
| `constants.js` | 時点のある値（値・出典・確認日） |
| `main.js` | 画面の制御・保存・共有リンク |
| `screen.js` | 画面の部品（上端の固定バー、`details` の `summary` の状態表示） |
| `style.css` | 見た目（共通部品の後ろに、このツールのグラフ・表・印刷 A4 2 枚） |
| `reset-storage.js` | 保存した内容をすべて消す（K123。テンプレートの共通部品） |
| `404.html` | ツール配下の存在しない URL で出るページ（サイト共通のもの） |
| `favicon.svg` / `apple-touch-icon.png` / `og-image.png` | アイコン / ホーム画面用アイコン / SNS 共有用画像（1200×630） |
| `sitemap.xml` | サイトマップ（robots.txt はドメイン直下で管理） |
| `tests/*.test.js` | テスト（`node --test tests/*.test.js`。`.github/workflows/test.yml` で push・PR のたびに自動実行） |

## ライセンス

MIT License（`LICENSE`）。
