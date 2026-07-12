import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type Feature from 'ol/Feature';
import type Point from 'ol/geom/Point';
import type CircleGeom from 'ol/geom/Circle';
import type LineString from 'ol/geom/LineString';
import type Polygon from 'ol/geom/Polygon';
import { unByKey } from 'ol/Observable';
import {
  readCoords,
  writeCircleCenter,
  writeCircleRadius,
  writeLine,
  writePoint,
  writePolygon,
} from './map/coords';
import type { LonLat } from './map/coords';

/** Imperative surface used by the panel's single 更新 / 取消 buttons. */
export interface CoordinateEditorHandle {
  apply: () => void;
  revert: () => void;
}

type StrLL = { lon: string; lat: string };

type PanelState =
  | { kind: 'point'; point: StrLL }
  | { kind: 'circle'; center: StrLL; radiusM: string }
  | { kind: 'line'; coords: StrLL[] }
  | { kind: 'polygon'; rings: StrLL[][] }
  | { kind: 'unsupported'; type: string };

const fmt = (n: number, decimals = 7): string => {
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
};
const toStrLL = (p: LonLat): StrLL => ({ lon: fmt(p[0]), lat: fmt(p[1]) });
const parse = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** Parse a list of string lon/lat pairs; null if any field is invalid. */
const buildLL = (rows: StrLL[]): LonLat[] | null => {
  const out: LonLat[] = [];
  for (const r of rows) {
    const lon = parse(r.lon);
    const lat = parse(r.lat);
    if (lon === null || lat === null) {
      return null;
    }
    out.push([lon, lat]);
  }
  return out;
};

/** True when the draft can be committed to a geometry. */
function isValid(s: PanelState): boolean {
  switch (s.kind) {
    case 'point':
      return parse(s.point.lon) !== null && parse(s.point.lat) !== null;
    case 'circle': {
      const r = parse(s.radiusM);
      return (
        parse(s.center.lon) !== null && parse(s.center.lat) !== null && r !== null && r > 0
      );
    }
    case 'line': {
      const b = buildLL(s.coords);
      return b !== null && b.length >= 2;
    }
    case 'polygon':
      return s.rings.every((r) => {
        const b = buildLL(r);
        return b !== null && b.length >= 3;
      });
    default:
      return true;
  }
}

function toPanel(feature: Feature): PanelState {
  const model = readCoords(feature.getGeometry());
  switch (model.kind) {
    case 'point':
      return { kind: 'point', point: toStrLL(model.point) };
    case 'circle':
      return { kind: 'circle', center: toStrLL(model.center), radiusM: fmt(model.radiusM, 2) };
    case 'line':
      return { kind: 'line', coords: model.coords.map(toStrLL) };
    case 'polygon':
      return { kind: 'polygon', rings: model.rings.map((r) => r.map(toStrLL)) };
    default:
      return { kind: 'unsupported', type: model.type };
  }
}

/** A pair of lon/lat number inputs. */
function LonLatInputs({
  value,
  onChange,
}: {
  value: StrLL;
  onChange: (axis: 'lon' | 'lat', v: string) => void;
}): JSX.Element {
  return (
    <div className="coord-pair">
      <label className="coord-axis">
        <span>経度</span>
        <input
          type="text"
          inputMode="decimal"
          value={value.lon}
          onChange={(e) => onChange('lon', e.target.value)}
        />
      </label>
      <label className="coord-axis">
        <span>緯度</span>
        <input
          type="text"
          inputMode="decimal"
          value={value.lat}
          onChange={(e) => onChange('lat', e.target.value)}
        />
      </label>
    </div>
  );
}

/** Editable vertex table shared by LineString (one ring) and Polygon (rings). */
function VertexTable({
  rings,
  minPerRing,
  isPolygon,
  onChange,
  onAdd,
  onRemove,
}: {
  rings: StrLL[][];
  minPerRing: number;
  isPolygon: boolean;
  onChange: (ri: number, vi: number, axis: 'lon' | 'lat', v: string) => void;
  onAdd: (ri: number) => void;
  onRemove: (ri: number, vi: number) => void;
}): JSX.Element {
  return (
    <div className="coord-list">
      {rings.map((ring, ri) => (
        <div key={ri} className="coord-ring">
          {isPolygon && <div className="coord-sub">{ri === 0 ? '外周' : `穴 ${ri}`}</div>}
          {ring.map((v, vi) => (
            <div key={vi} className="coord-vertex">
              <span className="coord-index">{vi + 1}</span>
              <LonLatInputs value={v} onChange={(axis, val) => onChange(ri, vi, axis, val)} />
              <button
                type="button"
                className="coord-del"
                title="頂点を削除"
                disabled={ring.length <= minPerRing}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onRemove(ri, vi)}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="coord-add"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAdd(ri)}
          >
            ＋ 頂点を追加
          </button>
        </div>
      ))}
    </div>
  );
}

export const CoordinateEditor = forwardRef<
  CoordinateEditorHandle,
  { feature: Feature; onDirtyChange?: (dirty: boolean, valid: boolean) => void }
>(function CoordinateEditor({ feature, onDirtyChange }, ref): JSX.Element {
  const [state, setState] = useState<PanelState>(() => toPanel(feature));
  // Guards the geometry 'change' we cause ourselves in apply() so it doesn't
  // bounce back through the map-wins listener.
  const selfEdit = useRef(false);

  const report = (s: PanelState, dirty: boolean): void => {
    onDirtyChange?.(dirty, isValid(s));
  };

  // Re-read when the selected feature changes.
  useEffect(() => {
    const s = toPanel(feature);
    setState(s);
    report(s, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  // Map-driven edits win: mirror geometry changes into the panel and drop any
  // unapplied draft. Skips the change we cause ourselves in apply().
  useEffect(() => {
    const geom = feature.getGeometry();
    if (!geom) {
      return;
    }
    const key = geom.on('change', () => {
      if (selfEdit.current) {
        return;
      }
      const s = toPanel(feature);
      setState(s);
      report(s, false);
    });
    return () => unByKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  // A user edit updates the draft only; the map/file change on 更新.
  const edit = (s: PanelState): void => {
    setState(s);
    report(s, true);
  };

  useImperativeHandle(
    ref,
    () => ({
      apply: (): void => {
        if (!isValid(state)) {
          return;
        }
        selfEdit.current = true;
        try {
          const geom = feature.getGeometry();
          switch (state.kind) {
            case 'point':
              writePoint(geom as Point, [parse(state.point.lon)!, parse(state.point.lat)!]);
              break;
            case 'circle':
              writeCircleCenter(geom as CircleGeom, [
                parse(state.center.lon)!,
                parse(state.center.lat)!,
              ]);
              writeCircleRadius(geom as CircleGeom, parse(state.radiusM)!);
              break;
            case 'line':
              writeLine(geom as LineString, buildLL(state.coords)!);
              break;
            case 'polygon':
              writePolygon(
                geom as Polygon,
                state.rings.map((r) => buildLL(r)!) as LonLat[][]
              );
              break;
            default:
              break;
          }
        } finally {
          selfEdit.current = false;
        }
        report(state, false);
      },
      revert: (): void => {
        const s = toPanel(feature);
        setState(s);
        report(s, false);
      },
    }),
    // Recreate so apply()/revert() see the latest draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, feature]
  );

  let body: JSX.Element;
  if (state.kind === 'point') {
    const onChange = (axis: 'lon' | 'lat', v: string): void => {
      edit({ kind: 'point', point: { ...state.point, [axis]: v } });
    };
    body = <LonLatInputs value={state.point} onChange={onChange} />;
  } else if (state.kind === 'circle') {
    const onCenter = (axis: 'lon' | 'lat', v: string): void => {
      edit({ ...state, center: { ...state.center, [axis]: v } });
    };
    const onRadius = (v: string): void => {
      edit({ ...state, radiusM: v });
    };
    body = (
      <>
        <div className="coord-sub">中心</div>
        <LonLatInputs value={state.center} onChange={onCenter} />
        <label className="coord-axis coord-radius">
          <span>半径 (m)</span>
          <input
            type="text"
            inputMode="decimal"
            value={state.radiusM}
            onChange={(e) => onRadius(e.target.value)}
          />
        </label>
      </>
    );
  } else if (state.kind === 'line') {
    const onChange = (_ri: number, vi: number, axis: 'lon' | 'lat', v: string): void => {
      edit({ kind: 'line', coords: state.coords.map((c, i) => (i === vi ? { ...c, [axis]: v } : c)) });
    };
    const onAdd = (): void => {
      const last = state.coords[state.coords.length - 1] ?? { lon: '0', lat: '0' };
      edit({ kind: 'line', coords: [...state.coords, { ...last }] });
    };
    const onRemove = (_ri: number, vi: number): void => {
      if (state.coords.length <= 2) {
        return;
      }
      edit({ kind: 'line', coords: state.coords.filter((_, i) => i !== vi) });
    };
    body = (
      <VertexTable
        rings={[state.coords]}
        minPerRing={2}
        isPolygon={false}
        onChange={onChange}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    );
  } else if (state.kind === 'polygon') {
    const onChange = (ri: number, vi: number, axis: 'lon' | 'lat', v: string): void => {
      edit({
        kind: 'polygon',
        rings: state.rings.map((r, i) =>
          i === ri ? r.map((c, j) => (j === vi ? { ...c, [axis]: v } : c)) : r
        ),
      });
    };
    const onAdd = (ri: number): void => {
      const ring = state.rings[ri];
      const last = ring[ring.length - 1] ?? { lon: '0', lat: '0' };
      edit({
        kind: 'polygon',
        rings: state.rings.map((r, i) => (i === ri ? [...r, { ...last }] : r)),
      });
    };
    const onRemove = (ri: number, vi: number): void => {
      if (state.rings[ri].length <= 3) {
        return;
      }
      edit({
        kind: 'polygon',
        rings: state.rings.map((r, i) => (i === ri ? r.filter((_, j) => j !== vi) : r)),
      });
    };
    body = (
      <VertexTable
        rings={state.rings}
        minPerRing={3}
        isPolygon
        onChange={onChange}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    );
  } else {
    body = <div className="coord-note">{state.type} は地図上で編集してください。</div>;
  }

  return (
    <div className="coord-editor">
      <div className="coord-title">座標</div>
      {body}
    </div>
  );
});
