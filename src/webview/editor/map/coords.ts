import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import CircleGeom from 'ol/geom/Circle';
import { fromLonLat, toLonLat } from 'ol/proj';
import type Geometry from 'ol/geom/Geometry';
import type { Coordinate } from 'ol/coordinate';
import { metersToProjectedRadius, projectedRadiusToMeters } from './circle';

// The map works in EPSG:3857; coordinates are shown/edited in EPSG:4326
// (lon/lat), matching how GeoJSON stores them.
export type LonLat = [number, number];

export type CoordModel =
  | { kind: 'point'; point: LonLat }
  | { kind: 'circle'; center: LonLat; radiusM: number }
  | { kind: 'line'; coords: LonLat[] }
  | { kind: 'polygon'; rings: LonLat[][] }
  | { kind: 'unsupported'; type: string };

/** A GeoJSON ring repeats its first vertex as the last; drop it for editing. */
function stripClose(ring: LonLat[]): LonLat[] {
  if (ring.length >= 2) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) {
      return ring.slice(0, -1);
    }
  }
  return ring;
}

/** Re-append the first vertex so the ring is closed before writing to OL. */
function closeRing(ring: LonLat[]): LonLat[] {
  if (ring.length >= 1) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) {
      return [...ring, a];
    }
  }
  return ring;
}

const ll = (c: Coordinate): LonLat => toLonLat(c) as LonLat;

/** Read a geometry's coordinates as lon/lat for display in the panel. */
export function readCoords(geom: Geometry | undefined): CoordModel {
  if (geom instanceof Point) {
    return { kind: 'point', point: ll(geom.getCoordinates()) };
  }
  if (geom instanceof CircleGeom) {
    const center = geom.getCenter();
    return {
      kind: 'circle',
      center: ll(center),
      radiusM: projectedRadiusToMeters(geom.getRadius(), center),
    };
  }
  if (geom instanceof LineString) {
    return { kind: 'line', coords: geom.getCoordinates().map(ll) };
  }
  if (geom instanceof Polygon) {
    return { kind: 'polygon', rings: geom.getCoordinates().map((r) => stripClose(r.map(ll))) };
  }
  return { kind: 'unsupported', type: geom?.getType() ?? '(none)' };
}

export function writePoint(geom: Point, p: LonLat): void {
  geom.setCoordinates(fromLonLat(p));
}

export function writeLine(geom: LineString, coords: LonLat[]): void {
  geom.setCoordinates(coords.map((c) => fromLonLat(c)));
}

export function writePolygon(geom: Polygon, rings: LonLat[][]): void {
  geom.setCoordinates(rings.map((r) => closeRing(r).map((c) => fromLonLat(c))));
}

/** Move a circle's center while preserving its ground-meter radius. */
export function writeCircleCenter(geom: CircleGeom, center: LonLat): void {
  const meters = projectedRadiusToMeters(geom.getRadius(), geom.getCenter());
  const next = fromLonLat(center);
  geom.setCenterAndRadius(next, metersToProjectedRadius(meters, next));
}

export function writeCircleRadius(geom: CircleGeom, meters: number): void {
  geom.setRadius(metersToProjectedRadius(meters, geom.getCenter()));
}

/**
 * Map-projection (EPSG:3857) coordinate of the vertex a panel field refers to.
 * ri/vi are ignored for Point (the point) and Circle (its center).
 */
export function vertexCoordinate(
  geom: Geometry | undefined,
  ri: number,
  vi: number
): Coordinate | null {
  if (geom instanceof Point) {
    return geom.getCoordinates();
  }
  if (geom instanceof CircleGeom) {
    return geom.getCenter();
  }
  if (geom instanceof LineString) {
    return geom.getCoordinates()[vi] ?? null;
  }
  if (geom instanceof Polygon) {
    return geom.getCoordinates()[ri]?.[vi] ?? null;
  }
  return null;
}
