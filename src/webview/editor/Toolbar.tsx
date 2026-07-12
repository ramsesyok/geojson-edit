import type { Tool } from './map/MapController';

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'modify', label: '✏️ 編集', title: '地物をクリックで選択 → 頂点●ドラッグで編集 / Shift+ドラッグで平行移動 / 円のふちでリサイズ / Alt+クリックで頂点削除 / Ctrl+C・Ctrl+V で複製' },
  { id: 'Point', label: '• 点', title: '点(Point)を描く' },
  { id: 'LineString', label: '╱ 線', title: '線(PolyLine)を描く — ダブルクリックで終了' },
  { id: 'Polygon', label: '▰ 面', title: 'ポリゴンを描く — ダブルクリックで終了' },
  { id: 'Circle', label: '◯ 円', title: '円(Circle)を描く' },
  { id: 'delete', label: '🗑 削除', title: 'クリックした地物を削除' },
];

export function Toolbar({
  tool,
  onToolChange,
}: {
  tool: Tool;
  onToolChange: (t: Tool) => void;
}): JSX.Element {
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'tool active' : 'tool'}
          title={t.title}
          onClick={() => onToolChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
