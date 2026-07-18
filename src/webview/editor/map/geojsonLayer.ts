import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import CircleGeom from 'ol/geom/Circle';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import MultiPoint from 'ol/geom/MultiPoint';
import MultiLineString from 'ol/geom/MultiLineString';
import MultiPolygon from 'ol/geom/MultiPolygon';
import { fromLonLat, toLonLat } from 'ol/proj';
import { getCenter } from 'ol/extent';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import CircleStyle from 'ol/style/Circle';
import Text from 'ol/style/Text';
import type { FeatureLike } from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type { Coordinate } from 'ol/coordinate';
import { metersToProjectedRadius, projectedRadiusToMeters } from './circle';

// GeoJSON is stored as WGS84; the map view is Web Mercator.
export const DATA_PROJECTION = 'EPSG:4326';
export const VIEW_PROJECTION = 'EPSG:3857';

const format = new GeoJSON();
const round = (n: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

// Default blue-family colors for drawn features (used when a feature has no
// `color` property): visible on the light demotiles basemap and distinct from
// the red-orange selection highlight (#ff3d00).
const DEFAULT_POINT = '#1565c0';
const DEFAULT_LINE = '#1976d2';
const DEFAULT_POLYGON = '#0d47a1';
const DEFAULT_CIRCLE = '#0277bd';

/** A feature's `color` property, if it is a valid #rgb / #rrggbb hex. */
function featureColor(feature: FeatureLike): string | null {
  const v = feature.get('color');
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())
    ? v.trim()
    : null;
}

/** A feature's `name` property, if it is a non-empty string. */
function featureName(feature: FeatureLike): string | null {
  const v = feature.get('name');
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Geometry style using the feature's `color` (or the per-type default). */
function geometryStyle(type: string | undefined, color: string | null): Style {
  switch (type) {
    case 'Point':
    case 'MultiPoint':
      return new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: color ?? DEFAULT_POINT }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        }),
      });
    case 'LineString':
    case 'MultiLineString':
      return new Style({ stroke: new Stroke({ color: color ?? DEFAULT_LINE, width: 3 }) });
    case 'Circle':
      return new Style({
        stroke: new Stroke({ color: color ?? DEFAULT_CIRCLE, width: 2.5 }),
        fill: new Fill({ color: color ? hexToRgba(color, 0.15) : 'rgba(2, 119, 189, 0.15)' }),
      });
    default:
      return new Style({
        stroke: new Stroke({ color: color ?? DEFAULT_POLYGON, width: 2.5 }),
        fill: new Fill({ color: color ? hexToRgba(color, 0.18) : 'rgba(13, 71, 161, 0.18)' }),
      });
  }
}

/** A Point at the geometry's label anchor (point / center / mid / interior). */
function labelGeometry(geom: Geometry | undefined): Point | undefined {
  if (geom instanceof Point) return geom;
  if (geom instanceof CircleGeom) return new Point(geom.getCenter());
  if (geom instanceof LineString) return new Point(geom.getCoordinateAt(0.5));
  if (geom instanceof Polygon) return new Point(geom.getInteriorPoint().getCoordinates().slice(0, 2));
  if (geom) return new Point(getCenter(geom.getExtent()));
  return undefined;
}

/** Text style that draws `name` at the geometry's label anchor. */
function labelStyle(type: string | undefined, name: string): Style {
  const above = type === 'Point' || type === 'MultiPoint';
  return new Style({
    text: new Text({
      text: name,
      font: '600 12px "Segoe UI", sans-serif',
      fill: new Fill({ color: '#12203a' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
      overflow: true,
      offsetY: above ? -14 : 0,
    }),
    geometry: (f) => labelGeometry((f as Feature).getGeometry()),
    zIndex: 100,
  });
}

function styleFn(feature: FeatureLike): Style[] {
  const type = feature.getGeometry()?.getType();
  const styles = [geometryStyle(type, featureColor(feature))];
  const name = featureName(feature);
  if (name) {
    styles.push(labelStyle(type, name));
  }
  return styles;
}

export function createGeojsonLayer(): { layer: VectorLayer; source: VectorSource } {
  const source = new VectorSource();
  const layer = new VectorLayer({ source, style: styleFn });
  return { layer, source };
}

// --- Selection / editing highlight -----------------------------------------

const HIGHLIGHT = '#ff3d00';

/** All editable vertices of a geometry, used to draw ● handles when selected. */
function vertexCoordinates(geom: Geometry | undefined): Coordinate[] {
  if (geom instanceof Point) return [geom.getCoordinates()];
  if (geom instanceof CircleGeom) return [geom.getCenter()];
  if (geom instanceof LineString) return geom.getCoordinates();
  if (geom instanceof MultiPoint) return geom.getCoordinates();
  if (geom instanceof Polygon) return geom.getCoordinates().flat();
  if (geom instanceof MultiLineString) return geom.getCoordinates().flat();
  if (geom instanceof MultiPolygon) return (geom.getCoordinates().flat(2) as Coordinate[]);
  return [];
}

const vertexHandleStyle = new Style({
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: '#ffffff' }),
    stroke: new Stroke({ color: HIGHLIGHT, width: 2 }),
  }),
  geometry: (feature: FeatureLike) =>
    new MultiPoint(vertexCoordinates((feature as Feature).getGeometry())),
});

/**
 * Style for a selected (being-edited) feature: a bright highlight of the
 * geometry plus ● handles at every vertex.
 */
export function selectedStyle(feature: FeatureLike): Style[] {
  const type = feature.getGeometry()?.getType();
  const isPoint = type === 'Point' || type === 'MultiPoint';
  const highlight = new Style({
    stroke: new Stroke({ color: HIGHLIGHT, width: 3 }),
    fill: new Fill({ color: 'rgba(255, 61, 0, 0.15)' }),
    image: isPoint
      ? new CircleStyle({
          radius: 7,
          fill: new Fill({ color: HIGHLIGHT }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        })
      : undefined,
  });
  // Points are already drawn as a dot; only add vertex handles for lines/areas.
  const styles = isPoint ? [highlight] : [highlight, vertexHandleStyle];
  // Keep the name label visible while editing (the custom color is not — the
  // highlight takes over until the feature is deselected).
  const name = featureName(feature);
  if (name) {
    styles.push(labelStyle(type, name));
  }
  return styles;
}

// Bright marker drawn on the focused vertex whose coordinate field is active.
const focusedVertexStyle = new Style({
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: 'rgba(255, 213, 0, 0.9)' }),
    stroke: new Stroke({ color: HIGHLIGHT, width: 2.5 }),
  }),
});

/** A thin overlay layer that highlights a single vertex (see MapController). */
export function createHighlightLayer(): { layer: VectorLayer; source: VectorSource } {
  const source = new VectorSource();
  const layer = new VectorLayer({ source, style: focusedVertexStyle, zIndex: 10 });
  return { layer, source };
}

/**
 * A GeoJSON Point whose properties carry a numeric `radius` is treated as a
 * circle (our storage convention for OL Circle geometries).
 */
function isCircleFeature(
  feat: RawFeature
): feat is RawFeature & {
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
} {
  return (
    feat?.geometry?.type === 'Point' &&
    Array.isArray(feat.geometry.coordinates) &&
    !!feat.properties &&
    typeof feat.properties.radius === 'number'
  );
}

// --- Data preservation ------------------------------------------------------
// Round-tripping should not silently drop information the editor doesn't touch.
// `bbox` is intentionally not preserved because edits make it stale.
const RESERVED_FEATURE_KEYS = new Set(['type', 'geometry', 'properties', 'id', 'bbox']);
const RESERVED_TOP_KEYS = new Set(['type', 'features', 'bbox']);
const TOP_EXTRAS_KEY = '_geojsonEditTopExtras';

// Foreign members of each feature (anything beyond type/geometry/properties/id),
// keyed by the OL feature so they survive edits without polluting properties.
const featureExtras = new WeakMap<Feature, Record<string, unknown>>();

function collectExtras(
  obj: Record<string, unknown>,
  reserved: Set<string>
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!reserved.has(k)) {
      extras[k] = v;
    }
  }
  return extras;
}

interface RawFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown> | null;
  id?: string | number;
  [k: string]: unknown;
}

/** Replace the overlay's features with those parsed from GeoJSON text. */
export function loadGeojsonText(source: VectorSource, text: string): void {
  source.clear();
  source.set(TOP_EXTRAS_KEY, {}, true);
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  let json: { type?: string; features?: unknown[] } & Record<string, unknown>;
  try {
    json = JSON.parse(trimmed);
  } catch (e) {
    // Partial / invalid JSON (e.g. mid-edit in a text editor) — skip rendering.
    console.warn('GeoJSON parse skipped:', e);
    return;
  }

  // Preserve top-level foreign members (name, crs, etc.).
  if (json?.type === 'FeatureCollection') {
    source.set(TOP_EXTRAS_KEY, collectExtras(json, RESERVED_TOP_KEYS), true);
  }

  const raw: unknown[] =
    json?.type === 'FeatureCollection'
      ? json.features ?? []
      : json?.type === 'Feature'
      ? [json]
      : [];

  const olFeatures: Feature[] = [];
  for (const rawFeat of raw) {
    const feat = rawFeat as RawFeature;
    try {
      let olf: Feature;
      if (isCircleFeature(feat)) {
        const [lon, lat] = feat.geometry.coordinates;
        const center = fromLonLat([lon, lat]);
        const projRadius = metersToProjectedRadius(feat.properties.radius as number, center);
        olf = new Feature(new CircleGeom(center, projRadius));
        olf.setProperties({ ...feat.properties });
      } else {
        olf = format.readFeature(feat, {
          dataProjection: DATA_PROJECTION,
          featureProjection: VIEW_PROJECTION,
        }) as Feature;
      }
      if (olf.getId() === undefined && feat.id !== undefined) {
        olf.setId(feat.id);
      }
      const extras = collectExtras(feat, RESERVED_FEATURE_KEYS);
      if (Object.keys(extras).length > 0) {
        featureExtras.set(olf, extras);
      }
      olFeatures.push(olf);
    } catch (e) {
      console.warn('skip feature:', e);
    }
  }
  source.addFeatures(olFeatures);
}

/**
 * Serialize the overlay's features to pretty-printed GeoJSON text.
 * Circle geometries are written as a center Point + `radius` (meters).
 * Feature ids and top-level / feature foreign members are preserved.
 */
export function serializeGeojson(source: VectorSource): string {
  const topExtras = (source.get(TOP_EXTRAS_KEY) as Record<string, unknown> | undefined) ?? {};
  const outFeatures: unknown[] = [];

  for (const f of source.getFeatures()) {
    const geom = f.getGeometry();
    let featObj: Record<string, unknown>;
    if (geom instanceof CircleGeom) {
      const center = geom.getCenter();
      const [lon, lat] = toLonLat(center);
      const props: Record<string, unknown> = { ...f.getProperties() };
      delete props.geometry;
      props.radius = round(projectedRadiusToMeters(geom.getRadius(), center), 2);
      featObj = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [round(lon, 7), round(lat, 7)] },
        properties: props,
      };
    } else if (geom) {
      featObj = format.writeFeatureObject(f, {
        dataProjection: DATA_PROJECTION,
        featureProjection: VIEW_PROJECTION,
        decimals: 7,
      }) as unknown as Record<string, unknown>;
    } else {
      continue;
    }

    // Foreign members first, real fields win; then the id.
    const merged: Record<string, unknown> = { ...(featureExtras.get(f) ?? {}), ...featObj };
    const id = f.getId();
    if (id !== undefined) {
      merged.id = id;
    }
    outFeatures.push(merged);
  }

  return JSON.stringify({ type: 'FeatureCollection', ...topExtras, features: outFeatures }, null, 2);
}
