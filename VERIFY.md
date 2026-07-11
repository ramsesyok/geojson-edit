# GeoJSON Map Editor (Phase 1)

VSCode 拡張機能: `.geojson` を内蔵マップ(オフライン / エアギャップ対応)で開いて表示・編集する。

## 実装状況
- **Phase 1 (完了)**: `.geojson` のカスタムエディタ化、webview の React+TS 化、
  内蔵 PMTiles ベースマップ表示、既存 GeoJSON のマップ描画、ホスト⇔webview 双方向同期。
- **Phase 2 (完了)**: 作図ツールバー(編集/点/線/面/円/削除)、Draw/Modify/Snap、
  Circle の Point+radius 変換、作図→ドキュメント反映(edit 同期)。
- Phase 3 以降: プロパティ編集、フィールド設定(ワークスペース settings.json)。

## 使い方(Phase 2)
- 左上ツールバーで操作を切替:
  - **✋ 編集**: 頂点をドラッグして編集 / 円のふちをドラッグしてリサイズ。
  - **• 点 / ╱ 線 / ▰ 面 / ◯ 円**: 地図上で作図(線・面はダブルクリックで確定)。
  - **🗑 削除**: 地物をクリックで削除。
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
