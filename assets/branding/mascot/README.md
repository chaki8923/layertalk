# LayerTalk マスコット

既存案を含む計7種類。乳白色と薄紫の柔らかな質感、手足のない左右非対称の吹き出し、点目と波形口を共通にしています。

[7案を明暗で比較する](comparison.html)

[PDFの比較一覧](review/mascot-comparison.pdf) · [明るい背景のプレビュー](review/mascot-comparison-1.png) · [暗い背景のプレビュー](review/mascot-comparison-2.png)

| 案 | 元画像 | 生成プロンプト | トップページでの配置 |
|---|---|---|---|
| 基本 | [01-neutral.png](01-neutral.png) | [プロンプト](01-neutral-prompt.txt) | ヒーロー |
| 丸い | [02-round.png](02-round.png) | [プロンプト](02-round-prompt.txt) | 参加フォーム |
| 縦長 | [03-tall.png](03-tall.png) | [プロンプト](03-tall-prompt.txt) | 予備 |
| 横長 | [04-long.png](04-long.png) | [プロンプト](04-long-prompt.txt) | 機能紹介 |
| 平たい | [05-flat.png](05-flat.png) | [プロンプト](05-flat-prompt.txt) | 予備 |
| 傾いた | [06-lean.png](06-lean.png) | [プロンプト](06-lean-prompt.txt) | 最後のCTA |
| 膨らんだ | [07-puff.png](07-puff.png) | [プロンプト](07-puff-prompt.txt) | 予備 |

## 素材と再生成

- 全画像は1536 × 1024pxの透過PNG。基本案は `../layertalk-mascot-concept-v1.png` の変更なしのコピーです。
- 追加6案は内蔵の画像生成で、それぞれ同じ基本案を参照して生成しました。各プロンプトと透過設定を保持しています。
- 明暗比較は背景だけを変えます。元画像に色補正・フィルター・背景合成を加えていません。
- サイト用のPNGは `apps/audience-web/public/mascot/` に同一のバイト列でコピーしています。
- [manifest.json](manifest.json) に寸法、透過、SHA-256、サイト用コピーとの一致を記録しています。

## 完成レイアウトの保存版

| 言語 | ライト | ダーク |
|---|---|---|
| 日本語 | [保存版](review/design-ja-light.html) | [保存版](review/design-ja-dark.html) |
| 英語 | [保存版](review/design-en-light.html) | [保存版](review/design-en-dark.html) |

保存版は実際のNext.jsサーバーのHTMLとCSSから作成します。ブラウザの安全性チェックによりスクリーンショット取得が拒否されたため、画像としての画面キャプチャではありません。
これらは本番用の `main` に統合する前のデザイン保存版です。本番では既存の「開始→URL共有」の2ステップ説明と `/join` の参加ページを保持しています。
JavaScriptを含まず、マスコット操作・参加フォーム送信は再生しません。画像は元PNGを参照し、レイアウトは画面幅に追従します。
操作の確認には [通常プレビュー](http://localhost:3000/) を使ってください。

## モーションと外観

共通 `Mascot` がPNGと顔の保護マスク、本体の操作範囲、浮遊、ホバー、クリックを管理します。
顔の画像には伸縮をかけず、体のレイヤーだけを変形します。タップはネイティブボタンなのでEnter・Spaceでも同じ操作になります。
連打時は現在の倍率から再開し、画面外・タブ非表示・一時停止・動きを減らす設定では停止します。

詳細な色・文字・形・周期は [デザインシステム](../../../docs/design-system.md) の「トップページのマスコット外観」を参照してください。

[検証記録と未確認項目](review/verification.md)
