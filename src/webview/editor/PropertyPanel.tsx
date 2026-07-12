import { useEffect, useState } from 'react';
import type Feature from 'ol/Feature';
import type { FieldDef } from './vscodeApi';
import { CoordinateEditor } from './CoordinateEditor';

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
  onOpenSettings,
}: {
  feature: Feature;
  fields: FieldDef[];
  onOpenSettings: () => void;
}): JSX.Element {
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    readValues(feature, fields)
  );

  // Refresh when the selected feature or the field definitions change.
  useEffect(() => {
    setValues(readValues(feature, fields));
  }, [feature, fields]);

  const geomType = feature.getGeometry()?.getType() ?? '';

  const change = (f: FieldDef, raw: FieldValue): void => {
    setValues((v) => ({ ...v, [f.key]: raw }));
    applyToFeature(feature, f, raw);
  };

  return (
    <div className="prop-panel">
      <div className="prop-header">
        <span>プロパティ</span>
        <span className="prop-geom">{geomType}</span>
      </div>
      <div className="prop-body">
        <CoordinateEditor feature={feature} />
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
    </div>
  );
}
