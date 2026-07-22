import { useState } from 'react';
import type Feature from 'ol/Feature';
import { getUid } from 'ol/util';
import type { Tool } from './map/MapController';

const ADD_TOOLS: { type: Tool; label: string }[] = [
  { type: 'Point', label: '• 点' },
  { type: 'LineString', label: '╱ 線' },
  { type: 'Polygon', label: '▰ 面' },
  { type: 'Circle', label: '◯ 円' },
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

// Explicitly-colored SVG icons (via currentColor) so they read on any theme,
// unlike emoji glyphs which render in their own (often dark) colors.
function EditIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.3 2.3l2.4 2.4M12.5 1.1l2.4 2.4-8.3 8.3-3.2.8.8-3.2 8.3-8.3z" />
    </svg>
  );
}
function TrashIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h11M6 4V2.5h4V4M4.5 4l.6 9.5h5.8L11.5 4M6.5 6.5v5M9.5 6.5v5" />
    </svg>
  );
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
  const [menuOpen, setMenuOpen] = useState(false);
  const drawing = ADD_TOOLS.find((t) => t.type === activeTool);

  return (
    <div className="feature-panel">
      <div className="fp-section">
        <button
          type="button"
          className={drawing ? 'fp-add-toggle active' : 'fp-add-toggle'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span>{drawing ? `作図中: ${drawing.label}` : '＋ 新規Feature追加'}</span>
          <span className="fp-caret">▾</span>
        </button>
        {menuOpen && (
          <>
            <div className="fp-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="fp-menu" role="menu">
              {ADD_TOOLS.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  className="fp-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onAdd(t.type);
                    setMenuOpen(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="fp-list-header">Feature 一覧 ({features.length})</div>
      <div className="fp-list">
        {features.length === 0 ? (
          <div className="fp-empty">地物がありません。「新規Feature追加」から作成します。</div>
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
                  className="fp-icon fp-edit"
                  title="編集"
                  aria-label="編集"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(feature);
                  }}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="fp-icon fp-del"
                  title="削除"
                  aria-label="削除"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(feature);
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
