# GeoJSON Map Editor (Phase 1)

VSCode 拡張機能: `.geojson` を内蔵マップ(オフライン / エアギャップ対応)で開いて表示・編集する。

## 実装状況
- **Phase 1 (完了)**: `.geojson` のカスタムエディタ化、webview の React+TS 化、
  内蔵 PMTiles ベースマップ表示、既存 GeoJSON のマップ描画、ホスト⇔webview 双方向同期。
- **Phase 2 (完了)**: 作図ツールバー(編集/点/線/面/円/削除)、Draw/Modify/Snap/Translate、
  選択ハイライト＋頂点●、Circle の Point+radius 変換、作図→ドキュメント反映(edit 同期)。
- **Phase 3 (完了)**: プロパティ編集パネル、ワークスペース settings.json の
  `geojson-edit.fields`(string/number/boolean/enum)によるフィールド定義。
- **仕上げ (完了)**: データ保全(feature id / top-level 独自メンバー保持)、
  新規作成コマンド＋空ファイル雛形、初回ロードでデータ範囲にズーム、
  webview の minify、`.vsix` パッケージ化(`npm run package`)。

## フィールド定義(Phase 3)
ワークスペース `settings.json` に定義する(例):
```json
"geojson-edit.fields": [
  { "key": "name", "type": "string", "label": "名称" },
  { "key": "category", "type": "enum", "label": "分類", "options": ["都市", "経路"] },
  { "key": "population", "type": "number", "label": "人口" },
  { "key": "visited", "type": "boolean", "label": "訪問済み" }
]
```
- 「✏️ 編集」で地物を選択すると右側にプロパティパネルが出る。
- 入力すると `properties` に反映(空欄はキー削除)。パネルの「フィールド設定を開く」または
  コマンド `GeoJSON Edit: フィールド設定を開く` で設定画面へ。

## 使い方(Phase 2)
- 左上ツールバーで操作を切替:
  - **✏️ 編集**: 頂点をドラッグして編集 / **Shift+ドラッグで平行移動**(線・面・点・円すべて共通。通常ドラッグでは移動しない=誤操作防止) / 円のふちをドラッグしてリサイズ / **Alt+クリックで頂点を削除**(線は2点以上、面のリングは3点以上を維持)。
  - **• 点 / ╱ 線 / ▰ 面 / ◯ 円**: 地図上で作図(線・面はダブルクリックで確定)。
  - **🗑 削除**: 地物をクリックで削除。
- 編集の解除(編集終了)は、空白をクリック または **Esc キー**。
- **コピー＆ペースト**: 選択中に **Ctrl+C**(Mac は Cmd+C)でコピー、**Ctrl+V** で少しずらして複製(同一エディタ内。円も複製可)。
- 作図・編集・削除は約0.3秒後にファイルへ反映(dirty 表示)。`Ctrl+S` で保存。
- テキストで開き直すと GeoJSON を確認可能。円は中心 Point + `properties.radius`(メートル)。

## 前提
- `media/world.pmtiles` (約 3.8MB) が配置済みであること。

## ビルドと実行
1. `npm install`
2. `npm run build`
3. VSCode でこのフォルダを開き **F5**(「Run Extension」)→ Extension Development Host が起動。
4. その新しいウィンドウで `samples/sample.geojson` を開く
   (自動的に GeoJSON Map Editor で開く。テキストで開き直すには
   エディタ右上「…」→「Reopen With…」→ Text Editor)。

## 期待する動作
- 世界の輪郭(青線)の上に、東京の点(橙)・東京↔大阪の線(黄)・パリ近郊のポリゴン(水色)が表示される。
- テキストエディタで開き直して座標を書き換えて保存 → マップ側に反映(update 同期)。
- (Phase 2 で)マップ上の作図がファイルへ反映される(edit 同期)。

## 双方向同期の仕組み
- ファイルは通常の TextDocument のまま。編集は WorkspaceEdit 経由なので dirty 状態・
  Undo/Redo・保存・差分表示がすべて VSCode 標準で機能する。
- host → webview: `init` / `update`、webview → host: `ready` / `edit`
  (`src/extension/protocol.ts`)。
