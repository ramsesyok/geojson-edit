# GeoJSON Edit (offline)

オフライン / エアギャップ環境で動作する、内蔵マップ付きの GeoJSON 編集用 VSCode 拡張機能です。
地図データ(`world.pmtiles`)を同梱し、外部ネットワークや HTTP サーバなしで地図を表示・編集できます。

## 特長

- **完全オフライン**: 地図データを拡張機能に同梱。CDN・HTTP サーバ不要(WebView から `asWebviewUri` でメモリ読み込み)。
- **カスタムエディタ**: `.geojson` を開くと地図エディタで表示。通常のテキストファイルのままなので、保存・Undo/Redo・差分表示は VSCode 標準どおり。
- **作図ツール**: 点 (Point) / 線 (LineString) / 面 (Polygon) / 円 (Circle) / 削除。
- **編集**: クリックで選択(ハイライト＋頂点●)、頂点ドラッグ・本体の平行移動・円のリサイズ、スナップ対応。
- **円の保存**: GeoJSON に Circle 型が無いため、中心 Point + `properties.radius`(メートル)として保存し、再編集時に円へ復元。
- **プロパティ編集**: ワークスペース設定で定義したフィールド(string / number / boolean / enum)を選択地物に入力。
- **データ保全**: feature の `id` や top-level の独自メンバー(`crs` など)を保持して書き戻し。

## 使い方

1. `.geojson` を開く(自動で GeoJSON Map Editor で開きます)。
   - 新規作成: コマンド `GeoJSON Edit: 新規 GeoJSON を作成`。
2. ツールバーで操作を選択して作図・編集。
3. `Ctrl+S` で保存(通常の GeoJSON ファイルとして出力)。

### フィールド定義(プロパティ編集)

ワークスペースの `.vscode/settings.json` に定義します。コマンド `GeoJSON Edit: フィールド設定を開く` からも編集できます。

```json
"geojson-edit.fields": [
  { "key": "name", "type": "string", "label": "名称" },
  { "key": "category", "type": "enum", "label": "分類", "options": ["都市", "経路", "エリア"] },
  { "key": "population", "type": "number", "label": "人口" },
  { "key": "visited", "type": "boolean", "label": "訪問済み" }
]
```

## 開発 / ビルド

```sh
npm install
npm run build        # webview(vite)+ 拡張ホスト(tsc)をビルド
npm run package      # .vsix を生成(vsce)
```

VSCode でこのフォルダを開き F5 で「Run Extension」を起動するとデバッグできます。

## 座標系

- 保存: WGS84 (EPSG:4326)
- 表示: Web Mercator (EPSG:3857)

## 同梱データ

`media/world.pmtiles` は [maplibre/demotiles](https://github.com/maplibre/demotiles) の world.pmtiles を使用しています。
