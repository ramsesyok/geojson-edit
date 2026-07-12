import { useEffect, useRef, useState } from 'react';
import type Feature from 'ol/Feature';
import type { FieldDef } from './vscodeApi';
import { CoordinateEditor } from './CoordinateEditor';
import type { CoordinateEditorHandle } from './CoordinateEditor';

type FieldValue = string | boolean;

function readValues(feature: Feature, fields: FieldDef[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const f of fields) {
    const v = feature.get(f.key);
    values[f.key] = f.type === 'boolean' ? v === true : v == null ? '' : String(v);
  }
  return values;
}

function applyToFeature(feature: Feature, f: FieldDef, raw: FieldValue): void {
  if (f.type === 'boolean') {
    feature.set(f.key, raw === true);
    return;
  }
  const s = String(raw);
  if (s === '') {
    feature.unset(f.key);
    return;
  }
  if (f.type === 'number') {
    const n = Number(s);
    if (Number.isNaN(n)) {
      return;
    }
    feature.set(f.key, n);
  } else {
    feature.set(f.key, s);
  }
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: FieldValue;
  onChange: (raw: FieldValue) => void;
}): JSX.Element {
  const text = typeof value === 'string' ? value : '';
  switch (field.type) {
    case 'boolean':
      return (
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      );
    case 'number':
      return (
        <input type="number" value={text} onChange={(e) => onChange(e.target.value)} />
      );
    case 'enum':
      return (
        <select value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">(未設定)</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    default:
      return <input type="text" value={text} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function PropertyPanel({
  feature,
  fields,
  mapDirty,
  onCommit,
  onRevert,
  onOpenSettings,
}: {
  feature: Feature;
  fields: FieldDef[];
  mapDirty: boolean;
  onCommit: () => void;
  onRevert: () => void;
  onOpenSettings: () => void;
}): JSX.Element {
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    readValues(feature, fields)
  );
  const [propsDirty, setPropsDirty] = useState(false);
  const [coord, setCoord] = useState<{ dirty: boolean; valid: boolean }>({
    dirty: false,
    valid: true,
  });
  const coordRef = useRef<CoordinateEditorHandle>(null);

  // Refresh when the selected feature or the field definitions change.
  useEffect(() => {
    setValues(readValues(feature, fields));
    setPropsDirty(false);
  }, [feature, fields]);

  const geomType = feature.getGeometry()?.getType() ?? '';

  // Edits update the draft only; nothing reaches the map/file until 更新.
  const change = (f: FieldDef, raw: FieldValue): void => {
    setValues((v) => ({ ...v, [f.key]: raw }));
    setPropsDirty(true);
  };

  const dirty = propsDirty || coord.dirty || mapDirty;
  const canApply = dirty && coord.valid;

  const applyAll = (): void => {
    // Write the panel drafts into the feature, then let the controller commit
    // the whole draft (incl. map edits) and sync to the host.
    for (const f of fields) {
      applyToFeature(feature, f, values[f.key] ?? '');
    }
    coordRef.current?.apply();
    onCommit();
    // Reflect what was actually stored (drops invalid numbers, normalizes text).
    setValues(readValues(feature, fields));
    setPropsDirty(false);
  };

  const revertAll = (): void => {
    // Restore the geometry (map draft), then reset the panel drafts.
    onRevert();
    coordRef.current?.revert();
    setValues(readValues(feature, fields));
    setPropsDirty(false);
  };

  return (
    <div className="prop-panel">
      <div className="prop-header">
        <span>プロパティ</span>
        <span className="prop-geom">{geomType}</span>
      </div>
      <div className="prop-body">
        <CoordinateEditor
          ref={coordRef}
          feature={feature}
          onDirtyChange={(d, v) => setCoord({ dirty: d, valid: v })}
        />
        {fields.length === 0 ? (
          <div className="prop-empty">
            <p>編集できるフィールドが未定義です。</p>
            <button type="button" onClick={onOpenSettings}>
              フィールド設定を開く
            </button>
          </div>
        ) : (
          <div className="prop-fields">
            {fields.map((f) => (
              <label key={f.key} className="prop-row">
                <span className="prop-label">{f.label ?? f.key}</span>
                <FieldInput field={f} value={values[f.key] ?? ''} onChange={(raw) => change(f, raw)} />
              </label>
            ))}
            <button type="button" className="prop-settings" onClick={onOpenSettings}>
              フィールド設定を開く
            </button>
          </div>
        )}
      </div>
      <div className="prop-actions">
        <span className={dirty ? 'prop-status dirty' : 'prop-status'}>
          {dirty ? '未確定の変更' : '同期済み'}
        </span>
        <div className="prop-actions-btns">
          <button
            type="button"
            className="prop-btn-cancel"
            disabled={!dirty}
            onMouseDown={(e) => e.preventDefault()}
            onClick={revertAll}
          >
            取消
          </button>
          <button
            type="button"
            className="prop-btn-apply"
            disabled={!canApply}
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyAll}
          >
            更新
          </button>
        </div>
      </div>
    </div>
  );
}
