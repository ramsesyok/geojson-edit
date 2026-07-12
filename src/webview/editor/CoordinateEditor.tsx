import { useEffect, useRef, useState } from 'react';
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
  onFocusChange,
  onChange,
}: {
  value: StrLL;
  onFocusChange: (typing: boolean) => void;
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
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          onChange={(e) => onChange('lon', e.target.value)}
        />
      </label>
      <label className="coord-axis">
        <span>緯度</span>
        <input
          type="text"
          inputMode="decimal"
          value={value.lat}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
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
  setTyping,
  onChange,
  onAdd,
  onRemove,
}: {
  rings: StrLL[][];
  minPerRing: number;
  isPolygon: boolean;
  setTyping: (t: boolean) => void;
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
              <LonLatInputs
                value={v}
                onFocusChange={setTyping}
                onChange={(axis, val) => onChange(ri, vi, axis, val)}
              />
              <button
                type="button"
                className="coord-del"
                title="頂点を削除"
                disabled={ring.length <= minPerRing}
                onClick={() => onRemove(ri, vi)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="coord-add" onClick={() => onAdd(ri)}>
            ＋ 頂点を追加
          </button>
        </div>
      ))}
    </div>
  );
}

export function CoordinateEditor({ feature }: { feature: Feature }): JSX.Element {
  const [state, setState] = useState<PanelState>(() => toPanel(feature));
  // While true, ignore the geometry 'change' event we caused ourselves so the
  // panel doesn't fight the value the user is typing.
  const selfEdit = useRef(false);
  // While an input is focused, don't overwrite it from map-driven changes.
  const typing = useRef(false);

  useEffect(() => {
    setState(toPanel(feature));
  }, [feature]);

  // Map-driven edits (drag / modify / translate) mutate the geometry in place
  // and fire 'change'; mirror those into the panel live.
  useEffect(() => {
    const geom = feature.getGeometry();
    if (!geom) {
      return;
    }
    const key = geom.on('change', () => {
      if (selfEdit.current || typing.current) {
        return;
      }
      setState(toPanel(feature));
    });
    return () => unByKey(key);
  }, [feature]);

  const setTyping = (t: boolean): void => {
    typing.current = t;
  };
  const apply = (fn: () => void): void => {
    selfEdit.current = true;
    try {
      fn();
    } finally {
      selfEdit.current = false;
    }
  };

  let body: JSX.Element;
  if (state.kind === 'point') {
    const geom = feature.getGeometry() as Point;
    const onChange = (axis: 'lon' | 'lat', v: string): void => {
      const next = { ...state.point, [axis]: v };
      setState({ kind: 'point', point: next });
      const lon = parse(next.lon);
      const lat = parse(next.lat);
      if (lon !== null && lat !== null) {
        apply(() => writePoint(geom, [lon, lat]));
      }
    };
    body = <LonLatInputs value={state.point} onFocusChange={setTyping} onChange={onChange} />;
  } else if (state.kind === 'circle') {
    const geom = feature.getGeometry() as CircleGeom;
    const onCenter = (axis: 'lon' | 'lat', v: string): void => {
      const next = { ...state.center, [axis]: v };
      setState({ ...state, center: next });
      const lon = parse(next.lon);
      const lat = parse(next.lat);
      if (lon !== null && lat !== null) {
        apply(() => writeCircleCenter(geom, [lon, lat]));
      }
    };
    const onRadius = (v: string): void => {
      setState({ ...state, radiusM: v });
      const m = parse(v);
      if (m !== null && m > 0) {
        apply(() => writeCircleRadius(geom, m));
      }
    };
    body = (
      <>
        <div className="coord-sub">中心</div>
        <LonLatInputs value={state.center} onFocusChange={setTyping} onChange={onCenter} />
        <label className="coord-axis coord-radius">
          <span>半径 (m)</span>
          <input
            type="text"
            inputMode="decimal"
            value={state.radiusM}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            onChange={(e) => onRadius(e.target.value)}
          />
        </label>
      </>
    );
  } else if (state.kind === 'line') {
    const geom = feature.getGeometry() as LineString;
    const commit = (coords: StrLL[]): void => {
      const built = buildLL(coords);
      if (built && built.length >= 2) {
        apply(() => writeLine(geom, built));
      }
    };
    const onChange = (_ri: number, vi: number, axis: 'lon' | 'lat', v: string): void => {
      const coords = state.coords.map((c, i) => (i === vi ? { ...c, [axis]: v } : c));
      setState({ kind: 'line', coords });
      commit(coords);
    };
    const onAdd = (): void => {
      const last = state.coords[state.coords.length - 1] ?? { lon: '0', lat: '0' };
      const coords = [...state.coords, { ...last }];
      setState({ kind: 'line', coords });
      commit(coords);
    };
    const onRemove = (_ri: number, vi: number): void => {
      if (state.coords.length <= 2) {
        return;
      }
      const coords = state.coords.filter((_, i) => i !== vi);
      setState({ kind: 'line', coords });
      commit(coords);
    };
    body = (
      <VertexTable
        rings={[state.coords]}
        minPerRing={2}
        isPolygon={false}
        setTyping={setTyping}
        onChange={onChange}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    );
  } else if (state.kind === 'polygon') {
    const geom = feature.getGeometry() as Polygon;
    const commit = (rings: StrLL[][]): void => {
      const built = rings.map(buildLL);
      if (built.every((r) => r !== null && r.length >= 3)) {
        apply(() => writePolygon(geom, built as LonLat[][]));
      }
    };
    const onChange = (ri: number, vi: number, axis: 'lon' | 'lat', v: string): void => {
      const rings = state.rings.map((r, i) =>
        i === ri ? r.map((c, j) => (j === vi ? { ...c, [axis]: v } : c)) : r
      );
      setState({ kind: 'polygon', rings });
      commit(rings);
    };
    const onAdd = (ri: number): void => {
      const ring = state.rings[ri];
      const last = ring[ring.length - 1] ?? { lon: '0', lat: '0' };
      const rings = state.rings.map((r, i) => (i === ri ? [...r, { ...last }] : r));
      setState({ kind: 'polygon', rings });
      commit(rings);
    };
    const onRemove = (ri: number, vi: number): void => {
      if (state.rings[ri].length <= 3) {
        return;
      }
      const rings = state.rings.map((r, i) => (i === ri ? r.filter((_, j) => j !== vi) : r));
      setState({ kind: 'polygon', rings });
      commit(rings);
    };
    body = (
      <VertexTable
        rings={state.rings}
        minPerRing={3}
        isPolygon
        setTyping={setTyping}
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
}
