import type Feature from 'ol/Feature';
import { getUid } from 'ol/util';
import type { Tool } from './map/MapController';

const ADD_TOOLS: { type: Tool; label: string; title: string }[] = [
  { type: 'Point', label: '• 点', title: '点(Point)を追加' },
  { type: 'LineString', label: '╱ 線', title: '線を追加 — ダブルクリックで確定' },
  { type: 'Polygon', label: '▰ 面', title: '面を追加 — ダブルクリックで確定' },
  { type: 'Circle', label: '◯ 円', title: '円を追加' },
];

function geomLabel(type: string | undefined): string {
  switch (type) {
    case 'Point':
    case 'MultiPoint':
      return '点';
    case 'LineString':
    case 'MultiLineString':
      return '線';
    case 'Circle':
      return '円';
    default:
      return '面';
  }
}

/** Display name for a feature: its `name`, else "<type> #<index>". */
function featureLabel(feature: Feature, index: number): string {
  const name = feature.get('name');
  if (typeof name === 'string' && name.trim() !== '') {
    return name.trim();
  }
  return `${geomLabel(feature.getGeometry()?.getType())} #${index + 1}`;
}

export function FeaturePanel({
  features,
  selected,
  activeTool,
  onAdd,
  onSelect,
  onDelete,
}: {
  features: Feature[];
  selected: Feature | null;
  activeTool: Tool;
  onAdd: (type: Tool) => void;
  onSelect: (feature: Feature) => void;
  onDelete: (feature: Feature) => void;
}): JSX.Element {
  return (
    <div className="feature-panel">
      <div className="fp-section">
        <div className="fp-title">新規Feature追加</div>
        <div className="fp-add">
          {ADD_TOOLS.map((t) => (
            <button
              key={t.type}
              type="button"
              className={activeTool === t.type ? 'fp-add-btn active' : 'fp-add-btn'}
              title={t.title}
              onClick={() => onAdd(t.type)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fp-list-header">Feature 一覧 ({features.length})</div>
      <div className="fp-list">
        {features.length === 0 ? (
          <div className="fp-empty">地物がありません。上の「新規Feature追加」から作成します。</div>
        ) : (
          features.map((feature, i) => {
            const label = featureLabel(feature, i);
            return (
              <div
                key={getUid(feature)}
                className={feature === selected ? 'fp-item selected' : 'fp-item'}
                onClick={() => onSelect(feature)}
              >
                <span className="fp-item-label" title={label}>
                  {label}
                </span>
                <button
                  type="button"
                  className="fp-icon"
                  title="編集"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(feature);
                  }}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="fp-icon fp-del"
                  title="削除"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(feature);
                  }}
                >
                  🗑
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
